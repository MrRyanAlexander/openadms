// What wrong tries at a login cost (ARCHITECTURE §6, Abuse; spec/acceptance/10-api-and-sync.md
// AC-10-18; spec/THREAT-MODEL.md T-16; ADR-408, 409): NIST SP 800-63B-4 §2.2.3 and §3.2.2. The
// rule, and the policy values it and a session are held to.
import { describe, expect, it } from 'vitest';

import { MasterPasscodeTries, Policy, SignInTries } from '../src/index.ts';

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
  DATABASE_CONNECTION_WAIT_MS: '2000',
  DATABASE_WORK_LONGEST_MS: '5000',
  DATABASE_BUSY_RETRY_SECONDS: '5',
  MAP_FILE_RING_PAIRS_AT_MOST: '50000000',
  ESRI_LAYER_ANSWER_SECONDS: '60',
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
  MEDIA_FILE_BYTES_AT_MOST: '33554432',
  MEDIA_PART_BYTES_AT_MOST: '4194304',
  MEDIA_RECEIVING_BYTES_AT_MOST: '268435456',
  RATE_LIMIT_FILE_PARTS_PER_PHONE: '300',
  MAP_FILE_BYTES_AT_MOST: '16777216',
  MAP_FILE_UNZIPPED_BYTES_AT_MOST: '67108864',
  MAP_FILE_ENTRIES_AT_MOST: '1000',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  RATE_LIMIT_REQUESTS_PER_ADDRESS: '3000',
  RATE_LIMIT_REQUESTS_PER_ACCOUNT: '600',
  RATE_LIMIT_REQUESTS_PER_PHONE: '600',
  RATE_LIMIT_COUNTS_KEPT: '100000',
  SIGN_IN_ADDRESS_WINDOW_MINUTES: '60',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS: '30',
  SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN: '4',
  PASSWORD_RESET_ASKS_PER_ADDRESS: '10',
  PASSWORD_RESET_ASKS_PER_LOGIN: '3',
  MASTER_PASSCODE_MINIMUM_LENGTH: '8',
  MASTER_PASSCODE_MAXIMUM_LENGTH: '128',
  PHONE_KEY_REVOKED_AFTER_HOURS: '24',
  JOB_TRIES_BEFORE_SET_ASIDE: '5',
  RECONCILIATION_RUN_LONGEST_MINUTES: '10',
  JOB_QUEUE_POLL_SECONDS: '5',
  MAP_SERVER_ANSWER_SECONDS: '30',
  DEVICE_CLOCK_OFF_LIMIT_MINUTES: '5',
  JOB_TICKETS_AT_MOST: '200',
  PHONE_HELD_BYTES_PER_DAY: '16777216',
  PHONE_HELD_RECORDS_PER_DAY: '1000',
  MAP_FILE_READ_SECONDS: '60',
  MAP_FILE_READ_MEMORY_MEBIBYTES: '512',
};

// Monday 12 October 2026, 10:00 in Bayline County.
const now = new Date('2026-10-12T14:00:00Z');
const inSeconds = (seconds: number): Date => new Date(now.getTime() + seconds * 1000);

describe('wrong tries at a login', () => {
  const tries = new SignInTries(Policy.from(shipped));

  it('AC-10-18 the first four in a row are only counted', () => {
    for (const count of [1, 2, 3, 4]) expect(tries.after(count, now)).toEqual({ kind: 'COUNTED' });
  });

  it('AC-10-18 from the fifth, each makes the login wait twice as long as the one before: 30 s, 1, 2, 4, 8 minutes', () => {
    expect([5, 6, 7, 8, 9].map((count) => tries.after(count, now))).toEqual(
      [30, 60, 120, 240, 480].map((seconds) => ({ kind: 'WAIT', until: inSeconds(seconds) })),
    );
  });

  it('AC-10-18 from the twelfth the wait is the policy’s longest, an hour, and stays there until the lock', () => {
    expect([10, 11].map((count) => tries.after(count, now))).toEqual(
      [960, 1920].map((seconds) => ({ kind: 'WAIT', until: inSeconds(seconds) })),
    );
    for (const count of [12, 13, 30, 49]) {
      expect(tries.after(count, now)).toEqual({ kind: 'WAIT', until: inSeconds(3600) });
    }
  });

  it('AC-10-18 the fiftieth locks the login, and so would any after it (ADR-417)', () => {
    for (const count of [50, 51, 100]) expect(tries.after(count, now)).toEqual({ kind: 'LOCKED' });
    expect([49, 50, 51].map((count) => tries.locked(count))).toEqual([false, true, true]);
  });

  it('AC-10-18 a login may not be tried while it waits or once it is locked; a wait that is over closes nothing', () => {
    expect(tries.closed(5, inSeconds(30), now)).toBe(true);
    expect(tries.closed(5, inSeconds(30), inSeconds(29))).toBe(true);
    expect(tries.closed(5, inSeconds(30), inSeconds(30))).toBe(false);
    expect(tries.closed(4, null, now)).toBe(false);
    expect(tries.closed(0, null, now)).toBe(false);
    // Locked, whatever its wait was: it opens only when its password is set anew.
    expect(tries.closed(50, null, now)).toBe(true);
    expect(tries.closed(50, inSeconds(-3600), now)).toBe(true);
    // Short of the lock, a wait that is over closes nothing, however many tries came before.
    expect(tries.closed(49, inSeconds(-1), now)).toBe(false);
  });

  it('a wait is never over the policy’s longest, however late the firm puts the lock', () => {
    const late = new SignInTries(
      Policy.from({
        ...shipped,
        SIGN_IN_TRIES_BEFORE_LOCK: '100',
        SIGN_IN_LONGEST_WAIT_MINUTES: '60',
      }),
    );
    expect(late.after(11, now)).toEqual({ kind: 'WAIT', until: inSeconds(1920) });
    for (const count of [12, 13, 50, 99]) {
      expect(late.after(count, now)).toEqual({ kind: 'WAIT', until: inSeconds(3600) });
    }
    expect(late.after(100, now)).toEqual({ kind: 'LOCKED' });
  });
});

describe('the policy values of sign-in and sessions', () => {
  const refused = (name: string, written: string, range: string): void => {
    expect(() => Policy.from({ ...shipped, [name]: written }), `${name}=${written}`).toThrow(
      `The policy value ${name} must be a whole number, ${range}: "${written}".`,
    );
  };

  it('AC-10-12 an access token lasts 5 minutes, a quiet session 30, any session 12 hours, unless changed: never over the standard’s hour and day', () => {
    const policy = Policy.from(shipped);
    expect([
      policy.accessTokenMinutes,
      policy.sessionInactivityMinutes,
      policy.sessionOverallHours,
    ]).toEqual([5, 30, 12]);
    for (const written of ['0', '16']) refused('ACCESS_TOKEN_MINUTES', written, 'from 1 to 15');
    for (const written of ['1', '61']) {
      refused('SESSION_INACTIVITY_MINUTES', written, 'from 2 to 60');
    }
    for (const written of ['0', '25']) refused('SESSION_OVERALL_HOURS', written, 'from 1 to 24');
    expect(Policy.from({ ...shipped, SESSION_OVERALL_HOURS: '24' }).sessionOverallHours).toBe(24);
    expect(
      Policy.from({ ...shipped, SESSION_INACTIVITY_MINUTES: '60' }).sessionInactivityMinutes,
    ).toBe(60);
  });

  it('an access token never lasts as long as a session may stay quiet', () => {
    expect(() =>
      Policy.from({ ...shipped, ACCESS_TOKEN_MINUTES: '15', SESSION_INACTIVITY_MINUTES: '15' }),
    ).toThrow('The policy value ACCESS_TOKEN_MINUTES must be under SESSION_INACTIVITY_MINUTES.');
    expect(() =>
      Policy.from({ ...shipped, ACCESS_TOKEN_MINUTES: '15', SESSION_INACTIVITY_MINUTES: '16' }),
    ).not.toThrow();
  });

  it('AC-10-18 a wait after 5 wrong tries and a lock after 50, unless changed: a lock never later than the standard’s hundred, and never before the first wait', () => {
    const policy = Policy.from(shipped);
    expect([
      policy.signInTriesBeforeWait,
      policy.signInTriesBeforeLock,
      policy.signInFirstWaitSeconds,
      policy.signInLongestWaitMinutes,
    ]).toEqual([5, 50, 30, 60]);
    for (const written of ['0', '100'])
      refused('SIGN_IN_TRIES_BEFORE_WAIT', written, 'from 1 to 99');
    for (const written of ['1', '101'])
      refused('SIGN_IN_TRIES_BEFORE_LOCK', written, 'from 2 to 100');
    for (const written of ['0', '3601']) {
      refused('SIGN_IN_FIRST_WAIT_SECONDS', written, 'from 1 to 3600');
    }
    for (const written of ['0', '1441']) {
      refused('SIGN_IN_LONGEST_WAIT_MINUTES', written, 'from 1 to 1440');
    }
    expect(() =>
      Policy.from({ ...shipped, SIGN_IN_TRIES_BEFORE_WAIT: '10', SIGN_IN_TRIES_BEFORE_LOCK: '10' }),
    ).toThrow(
      'The policy value SIGN_IN_TRIES_BEFORE_WAIT must be under SIGN_IN_TRIES_BEFORE_LOCK.',
    );
    expect(
      Policy.from({ ...shipped, SIGN_IN_TRIES_BEFORE_LOCK: '100' }).signInTriesBeforeLock,
    ).toBe(100);
  });
});

describe('wrong tries at the master passcode', () => {
  it('AC-10-22 follow sign-in’s rule and numbers: a wait from the fifth in a row, twice as long each time and an hour at most, and the lock at the fiftieth', () => {
    const tries = new MasterPasscodeTries(Policy.from(shipped));
    const now = new Date('2026-10-12T13:50:00Z');
    const waitSeconds = (wrongInARow: number): number | string => {
      const cost = tries.after(wrongInARow, now);
      return cost.kind === 'WAIT' ? (cost.until.getTime() - now.getTime()) / 1000 : cost.kind;
    };
    expect([1, 4, 5, 6, 7, 12, 49, 50, 51].map(waitSeconds)).toEqual([
      'COUNTED',
      'COUNTED',
      30,
      60,
      120,
      3600,
      3600,
      'LOCKED',
      'LOCKED',
    ]);
    // While it waits or is locked it may not be tried; a lock doesn't open with time.
    const waiting = new Date('2026-10-12T13:50:30Z');
    expect(tries.closed(5, waiting, now)).toBe(true);
    expect(tries.closed(5, waiting, waiting)).toBe(false);
    expect(tries.closed(50, null, new Date('2027-10-12T13:50:00Z'))).toBe(true);
    expect(tries.closed(0, null, now)).toBe(false);
  });
});

describe('the master passcode’s wait, by address (ADR-541)', () => {
  it('AC-10-108 its wait holds only an address that has tried it wrong; the lock holds everybody; the first wait is the fifth wrong try in a row, never the lock', () => {
    const tries = new MasterPasscodeTries(Policy.from(shipped));
    const now = new Date('2026-10-12T13:50:00Z');
    const waiting = new Date('2026-10-12T13:50:30Z');
    // A stranger who tried it wrong waits; a supervisor at the office, who hasn't, doesn't.
    expect(tries.closedTo(5, waiting, now, true)).toBe(true);
    expect(tries.closedTo(5, waiting, now, false)).toBe(false);
    expect(tries.closedTo(5, waiting, waiting, true)).toBe(false);
    // The lock refuses everybody, wherever they are, however long they wait.
    expect(tries.closedTo(50, null, new Date('2027-10-12T13:50:00Z'), false)).toBe(true);
    expect(tries.closedTo(0, null, now, true)).toBe(false);
    expect([1, 4, 5, 6, 49, 50].map((count) => tries.firstWait(count))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});
