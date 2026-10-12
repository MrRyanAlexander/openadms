// How often a caller may ask (ARCHITECTURE §6, Abuse; spec/acceptance/10-api-and-sync.md AC-10-40;
// spec/THREAT-MODEL.md T-16, T-17; ADR-416): the rule, what an address is counted as, and the
// policy values the limits are held to.
import { describe, expect, it } from 'vitest';

import { addressCounted, Policy, RateLimit, rateLimitNames, RateLimits } from '../src/index.ts';

const shipped = {
  LOAD_CALL_LOW_LIMIT: '5',
  LOAD_CALL_HIGH_LIMIT: '95',
  DISPOSAL_SITE_PROXIMITY_M: '200',
  STUMP_FILL_DEPTH_INCHES: '31',
  CREW_DAY_HOURS: '12',
  TICKET_NUMBER_BLOCK_SIZE: '1000',
  CERT_NUMBER_BLOCK_SIZE: '100',
  ROE_NUMBER_BLOCK_SIZE: '100',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  STATEMENT_TIMEOUT_MS: '30000',
  DATABASE_POOL_CONNECTIONS: '10',
  PASSWORD_MINIMUM_LENGTH: '15',
  PASSWORD_MAXIMUM_LENGTH: '128',
  PASSWORD_RESET_MINUTES: '60',
  ACCESS_TOKEN_MINUTES: '5',
  SESSION_INACTIVITY_MINUTES: '30',
  SESSION_OVERALL_HOURS: '12',
  SIGN_IN_TRIES_BEFORE_WAIT: '5',
  SIGN_IN_TRIES_BEFORE_LOCK: '50',
  SIGN_IN_FIRST_WAIT_SECONDS: '30',
  SIGN_IN_LONGEST_WAIT_MINUTES: '60',
  TWO_STEP_CODE_STEPS_EITHER_SIDE: '1',
  TWO_STEP_SETUP_MINUTES: '10',
  PHONE_CHALLENGE_SECONDS: '120',
  PHONE_TOKEN_MINUTES: '15',
  MONITOR_SESSION_HOURS: '12',
  LOGIN_LIST_ENTRIES_PER_CALL: '50',
  ADDRESS_LOOKUP_ANSWER_SECONDS: '5',
  MEDIA_STORE_ANSWER_SECONDS: '30',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  RATE_LIMIT_REQUESTS_PER_ADDRESS: '3000',
  RATE_LIMIT_REQUESTS_PER_ACCOUNT: '600',
  RATE_LIMIT_COUNTS_KEPT: '100000',
  SIGN_IN_ADDRESS_WINDOW_MINUTES: '60',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS: '30',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN: '4',
  PASSWORD_RESET_ASKS_PER_ADDRESS: '10',
  PASSWORD_RESET_ASKS_PER_LOGIN: '3',
  JOB_TRIES_BEFORE_SET_ASIDE: '5',
  RECONCILIATION_RUN_LONGEST_MINUTES: '10',
  JOB_QUEUE_POLL_SECONDS: '5',
  MAP_SERVER_ANSWER_SECONDS: '30',
  DEVICE_CLOCK_OFF_LIMIT_MINUTES: '5',
  JOB_TICKETS_AT_MOST: '200',
};
const noon = new Date('2026-10-12T16:00:00Z');
const later = (seconds: number): Date => new Date(noon.getTime() + seconds * 1000);

describe('a rate limit', () => {
  const limit = new RateLimit(3, 60);

  it('AC-10-40 lets the policy’s count through in a stretch, then closes until the stretch is over, and says how long that is', () => {
    let kept = limit.counted(undefined, noon);
    expect(kept).toEqual({ from: noon.getTime(), count: 1 });
    expect(limit.closedFor(kept, later(1))).toBeUndefined();
    kept = limit.counted(kept, later(1));
    expect(limit.closedFor(kept, later(2))).toBeUndefined();
    kept = limit.counted(kept, later(2));
    // The stretch began with the first one counted, not the last.
    expect(kept).toEqual({ from: noon.getTime(), count: 3 });
    expect(limit.closedFor(kept, later(2))).toBe(58);
    expect(limit.closedFor(kept, later(59))).toBe(1);
    // Never told to wait nought seconds while it is still closed.
    expect(limit.closedFor(kept, later(59.9))).toBe(1);
    expect(limit.closedFor(kept, later(60))).toBeUndefined();
  });

  it('a stretch that is over counts nothing: the next one starts a new stretch', () => {
    const kept = { from: noon.getTime(), count: 3 };
    expect(limit.live(kept, later(59))).toBe(true);
    expect(limit.live(kept, later(60))).toBe(false);
    expect(limit.counted(kept, later(60))).toEqual({ from: later(60).getTime(), count: 1 });
    expect(limit.closedFor(undefined, noon)).toBeUndefined();
  });

  it('a caller nothing is kept for is not closed, and one over the count stays closed', () => {
    expect(limit.closedFor({ from: noon.getTime(), count: 7 }, later(30))).toBe(30);
    expect(new RateLimit(1, 1).closedFor({ from: noon.getTime(), count: 1 }, noon)).toBe(1);
  });
});

describe('the limits, from the policy', () => {
  it('AC-10-40 the counts are policy values: each limit is its own count over its own stretch', () => {
    const limits = new RateLimits(Policy.from(shipped));
    expect(
      rateLimitNames.map((name) => [name, limits.of(name).most, limits.of(name).seconds]),
    ).toEqual([
      ['REQUESTS_BY_ADDRESS', 3000, 60],
      ['REQUESTS_BY_ACCOUNT', 600, 60],
      ['WRONG_TRIES_BY_ADDRESS', 30, 3600],
      ['WRONG_TRIES_BY_ADDRESS_AT_LOGIN', 4, 3600],
      ['RESET_ASKS_BY_ADDRESS', 10, 3600],
      ['RESET_ASKS_BY_LOGIN', 3, 3600],
    ]);
    expect(limits.countsKept).toBe(100000);
    const own = new RateLimits(
      Policy.from({
        ...shipped,
        RATE_LIMIT_WINDOW_SECONDS: '10',
        RATE_LIMIT_REQUESTS_PER_ADDRESS: '7',
        SIGN_IN_ADDRESS_WINDOW_MINUTES: '5',
        PASSWORD_RESET_ASKS_PER_LOGIN: '1',
      }),
    );
    expect([own.of('REQUESTS_BY_ADDRESS').most, own.of('REQUESTS_BY_ADDRESS').seconds]).toEqual([
      7, 10,
    ]);
    expect([own.of('RESET_ASKS_BY_LOGIN').most, own.of('RESET_ASKS_BY_LOGIN').seconds]).toEqual([
      1, 300,
    ]);
  });

  it('each is held to its range, by name', () => {
    const refused = (name: string, written: string, range: string): void => {
      expect(() => Policy.from({ ...shipped, [name]: written })).toThrow(
        `The policy value ${name} must be a whole number, ${range}: "${written}".`,
      );
    };
    for (const written of ['0', '3601'])
      refused('RATE_LIMIT_WINDOW_SECONDS', written, 'from 1 to 3600');
    for (const name of [
      'RATE_LIMIT_REQUESTS_PER_ADDRESS',
      'RATE_LIMIT_REQUESTS_PER_ACCOUNT',
      'SIGN_IN_WRONG_TRIES_PER_ADDRESS',
      'PASSWORD_RESET_ASKS_PER_ADDRESS',
      'PASSWORD_RESET_ASKS_PER_LOGIN',
    ]) {
      for (const written of ['0', '-1', '1.5', 'off']) refused(name, written, '1 or more');
    }
    for (const written of ['999', '10000001']) {
      refused('RATE_LIMIT_COUNTS_KEPT', written, 'from 1000 to 10000000');
    }
    for (const written of ['0', '1441']) {
      refused('SIGN_IN_ADDRESS_WINDOW_MINUTES', written, 'from 1 to 1440');
    }
    for (const written of ['0', '99']) {
      refused('SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN', written, 'from 1 to 98');
    }
    for (const name of Object.keys(shipped).filter((key) =>
      /^(RATE_LIMIT|PASSWORD_RESET_ASKS)/.test(key),
    )) {
      const without: Record<string, string | undefined> = { ...shipped, [name]: undefined };
      expect(() => Policy.from(without)).toThrow(`The policy value ${name} is missing.`);
    }
  });

  it('one address is never allowed as many wrong tries at a login as put a wait on it', () => {
    expect(() =>
      Policy.from({ ...shipped, SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN: '5' }),
    ).toThrow(
      'The policy value SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN must be under SIGN_IN_TRIES_BEFORE_WAIT.',
    );
    expect(() =>
      Policy.from({
        ...shipped,
        SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN: '5',
        SIGN_IN_TRIES_BEFORE_WAIT: '6',
      }),
    ).not.toThrow();
  });
});

describe('what a caller’s address is counted as', () => {
  it('an IPv4 address whole, also when it is written inside an IPv6 one', () => {
    expect(addressCounted('203.0.113.7')).toBe('203.0.113.7');
    expect(addressCounted(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(addressCounted('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressCounted('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(addressCounted('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('an IPv6 address by its first 64 bits, however it is written: a caller with a whole network of addresses is one caller', () => {
    const one = addressCounted('2001:db8:12:3400::1');
    expect(one).toBe('2001:db8:12:3400::/64');
    for (const same of [
      '2001:db8:12:3400:ffff:ffff:ffff:ffff',
      '2001:0DB8:0012:3400:0000:0000:0000:0002',
      '2001:db8:12:3400:a::b',
      '2001:db8:12:3400::1%en0',
    ]) {
      expect(addressCounted(same)).toBe(one);
    }
    expect(addressCounted('2001:db8:12:3401::1')).not.toBe(one);
    expect(addressCounted('::1')).toBe('0:0:0:0::/64');
    expect(addressCounted('2001:db8::')).toBe('2001:db8:0:0::/64');
  });

  it('anything else as it was written, so that it is still one caller', () => {
    for (const odd of ['', 'unknown', '2001:db8::1::2', '2001:db8:zz::1', '1:2:3:4:5:6:7:8:9']) {
      expect(addressCounted(odd)).toBe(odd);
    }
  });
});
