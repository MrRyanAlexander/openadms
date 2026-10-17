// How often a caller may ask (ARCHITECTURE §6, Abuse; spec/acceptance/10-api-and-sync.md AC-10-40;
// spec/THREAT-MODEL.md T-16, T-17; ADR-416): OWASP ASVS 5.0 2.4.1, 6.1.1, 6.3.1; NIST SP 800-63B-4
// §3.2.2. A limit is so many in a stretch of time, counted for one caller: an address, a signed-in
// person, an address at one login. The stretch starts with the first one counted and is over
// when its seconds are; a caller at the limit is told how long is left of it. Every number is a
// policy value.
//
// These are beside the count of wrong tries a login keeps of its own (sign-in-tries.ts), which is
// what the standard's SHALL asks and is in the database. A limit here is what keeps one address
// from spending a login's tries, many logins' tries, or the server's time.
import type { Policy } from './policy.ts';

export type RateLimitsPolicy = Pick<
  Policy,
  | 'rateLimitWindowSeconds'
  | 'rateLimitRequestsPerAddress'
  | 'rateLimitRequestsPerAccount'
  | 'rateLimitRequestsPerPhone'
  | 'rateLimitFilePartsPerPhone'
  | 'rateLimitCountsKept'
  | 'signInAddressWindowMinutes'
  | 'signInWrongTriesPerAddress'
  | 'signInWrongTriesPerAddressAtLogin'
  | 'passwordResetAsksPerAddress'
  | 'passwordResetAsksPerLogin'
>;

// What is kept for one caller under one limit: when its stretch began, in milliseconds, and how
// many were counted in it.
export interface Counted {
  readonly from: number;
  readonly count: number;
}

export class RateLimit {
  readonly most: number;
  readonly seconds: number;

  constructor(most: number, seconds: number) {
    this.most = most;
    this.seconds = seconds;
  }

  // Whether what is kept still counts: a stretch that is over counts nothing.
  live(kept: Counted | undefined, now: Date): kept is Counted {
    return kept !== undefined && now.getTime() < kept.from + this.seconds * 1000;
  }

  // For a caller at the limit, the whole seconds until it may ask again; otherwise undefined.
  closedFor(kept: Counted | undefined, now: Date): number | undefined {
    if (!this.live(kept, now) || kept.count < this.most) return undefined;
    return Math.max(1, Math.ceil((kept.from + this.seconds * 1000 - now.getTime()) / 1000));
  }

  // What is kept once one more is counted.
  counted(kept: Counted | undefined, now: Date): Counted {
    return this.live(kept, now)
      ? { from: kept.from, count: kept.count + 1 }
      : { from: now.getTime(), count: 1 };
  }
}

export const rateLimitNames = [
  // Every request, by the address it came from.
  'REQUESTS_BY_ADDRESS',
  // Every request of a signed-in person, whatever address it came from.
  'REQUESTS_BY_ACCOUNT',
  // Every part of a photograph's file a phone sends, or asks after (ADR-482).
  'FILE_PARTS_BY_PHONE',
  // Every request of a proven phone, whatever address it came from and whoever is signed in on
  // it (ADR-490).
  'REQUESTS_BY_PHONE',
  // Tries at a secret that were refused (a sign-in, a reset's code, a current password, an
  // authenticator's code), by the address they came from, whoever's login was tried.
  'WRONG_TRIES_BY_ADDRESS',
  // Sign-ins refused from one address at one login.
  'WRONG_TRIES_BY_ADDRESS_AT_LOGIN',
  // Resets by email asked for, by the address that asked and by the login asked for.
  'RESET_ASKS_BY_ADDRESS',
  'RESET_ASKS_BY_LOGIN',
] as const;

export type RateLimitName = (typeof rateLimitNames)[number];

export class RateLimits {
  // How many callers' counts the server keeps at once: past it, the oldest goes.
  readonly countsKept: number;
  private readonly limits: Readonly<Record<RateLimitName, RateLimit>>;

  constructor(policy: RateLimitsPolicy) {
    const tries = policy.signInAddressWindowMinutes * 60;
    this.countsKept = policy.rateLimitCountsKept;
    this.limits = {
      REQUESTS_BY_ADDRESS: new RateLimit(
        policy.rateLimitRequestsPerAddress,
        policy.rateLimitWindowSeconds,
      ),
      REQUESTS_BY_ACCOUNT: new RateLimit(
        policy.rateLimitRequestsPerAccount,
        policy.rateLimitWindowSeconds,
      ),
      FILE_PARTS_BY_PHONE: new RateLimit(
        policy.rateLimitFilePartsPerPhone,
        policy.rateLimitWindowSeconds,
      ),
      REQUESTS_BY_PHONE: new RateLimit(
        policy.rateLimitRequestsPerPhone,
        policy.rateLimitWindowSeconds,
      ),
      WRONG_TRIES_BY_ADDRESS: new RateLimit(policy.signInWrongTriesPerAddress, tries),
      WRONG_TRIES_BY_ADDRESS_AT_LOGIN: new RateLimit(
        policy.signInWrongTriesPerAddressAtLogin,
        tries,
      ),
      RESET_ASKS_BY_ADDRESS: new RateLimit(policy.passwordResetAsksPerAddress, tries),
      RESET_ASKS_BY_LOGIN: new RateLimit(policy.passwordResetAsksPerLogin, tries),
    };
  }

  of(name: RateLimitName): RateLimit {
    return this.limits[name];
  }
}

const mappedIpv4 = /^(?:0{0,4}:){2,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

// What a caller's address is counted as. An IPv4 address is counted whole. An IPv6 address is
// counted by its first 64 bits: one subscriber is commonly handed all the addresses under them,
// so counting each apart would be no limit at all. An IPv4 address written inside an IPv6 one is
// the IPv4 address. Anything else is counted as it was written.
export function addressCounted(address: string): string {
  const written = (address.split('%', 1)[0] ?? '').trim().toLowerCase();
  if (!written.includes(':')) return written;
  const inside = mappedIpv4.exec(written)?.[1];
  if (inside !== undefined) return inside;
  const [head = '', tail, ...more] = written.split('::');
  if (more.length > 0) return written;
  const before = head === '' ? [] : head.split(':');
  const after = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? before
      : [
          ...before,
          ...Array<string>(Math.max(0, 8 - before.length - after.length)).fill('0'),
          ...after,
        ];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return written;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}
