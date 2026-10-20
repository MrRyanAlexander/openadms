// What a new project's settings start as (spec/acceptance/01-setup.md AC-01-06, AC-01-11;
// REQ-105d, 124d; invariant 16; ADR-303). The numbers are policy values the caller hands over,
// never written in the rule. That the release's own env file (packages/domain/policy.env) holds
// exactly the values used here is held by packages/scenarios/test/policy.test.ts, which may read a
// file; this package's tests, like its source, read none.
import { describe, expect, it } from 'vitest';

import { NewProjectSettings, Policy, policyNames, requestBodyBytesAtLeast } from '../src/index.ts';

// The policy values as the release ships them.
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
  PHONE_SIGN_IN_TRIES_BEFORE_WAIT: '5',
  PHONE_SIGN_IN_TRIES_BEFORE_LOCK: '10',
  PHONE_SIGN_IN_FIRST_WAIT_SECONDS: '30',
  PHONE_SIGN_IN_LONGEST_WAIT_MINUTES: '15',
  PHONE_INACTIVITY_LOCK_MINUTES: '30',
  PHONE_INACTIVITY_WARNING_SECONDS: '60',
  PHONE_SYNC_EVERY_MINUTES: '5',
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
  FIELD_EVENT_WAYPOINTS_AT_MOST: '50',
};

// The program types of the example world: PPDR requires an ROE, ROW doesn't.
const row = { requiresRoe: false };
const ppdr = { requiresRoe: true };

describe('a new project’s settings', () => {
  it('AC-01-11 start from the policy values: limits 5 and 95, a 200 m site circle, a 31 in fill depth, both stump checks on', () => {
    expect(new NewProjectSettings(Policy.from(shipped)).for(row)).toEqual({
      allowSplitLoads: false,
      loadCallLowLimit: 5,
      loadCallHighLimit: 95,
      stumpFillDepthInches: 31,
      stumpCheckRootBallWider: true,
      stumpCheckFillNeedsExposure: true,
      siteCircleMeters: 200,
      timeClockEnabled: false,
    });
  });

  it('AC-01-11 follow the policy values, never a number in code: other values, other settings', () => {
    const policy = Policy.from({
      ...shipped,
      LOAD_CALL_LOW_LIMIT: '10',
      LOAD_CALL_HIGH_LIMIT: '90',
      DISPOSAL_SITE_PROXIMITY_M: '300',
      STUMP_FILL_DEPTH_INCHES: '36',
      CREW_DAY_HOURS: '10',
    });
    expect(new NewProjectSettings(policy).for(row)).toMatchObject({
      loadCallLowLimit: 10,
      loadCallHighLimit: 90,
      siteCircleMeters: 300,
      stumpFillDepthInches: 36,
    });
  });

  it('AC-01-06 Allow split loads starts ticked where the program type requires ROEs (PPDR), unticked where it doesn’t (ROW)', () => {
    const settings = new NewProjectSettings(Policy.from(shipped));
    expect(settings.for(ppdr).allowSplitLoads).toBe(true);
    expect(settings.for(row).allowSplitLoads).toBe(false);
  });

  it('AC-01-06 are a start, not a lock: the firm ticks Allow split loads on a ROW project (P1), and nothing else moves', () => {
    const settings = new NewProjectSettings(Policy.from(shipped));
    const p1 = { ...settings.for(row), allowSplitLoads: true };
    expect(p1).toEqual({ ...settings.for(ppdr) });
  });

  it('the time clock starts switched off: not offered to workers until the firm switches it on (ADR-303, 304)', () => {
    const settings = new NewProjectSettings(Policy.from(shipped));
    expect([settings.for(row).timeClockEnabled, settings.for(ppdr).timeClockEnabled]).toEqual([
      false,
      false,
    ]);
  });
});

describe('the policy values', () => {
  it('are each under its own name in the environment', () => {
    expect(policyNames).toEqual({
      loadCallLowLimit: 'LOAD_CALL_LOW_LIMIT',
      loadCallHighLimit: 'LOAD_CALL_HIGH_LIMIT',
      siteCircleMeters: 'DISPOSAL_SITE_PROXIMITY_M',
      stumpFillDepthInches: 'STUMP_FILL_DEPTH_INCHES',
      crewDayHours: 'CREW_DAY_HOURS',
      ticketNumberBlockSize: 'TICKET_NUMBER_BLOCK_SIZE',
      certNumberBlockSize: 'CERT_NUMBER_BLOCK_SIZE',
      roeNumberBlockSize: 'ROE_NUMBER_BLOCK_SIZE',
      requestBodyLimitBytes: 'REQUEST_BODY_LIMIT_BYTES',
      statementTimeoutMs: 'STATEMENT_TIMEOUT_MS',
      databasePoolConnections: 'DATABASE_POOL_CONNECTIONS',
      databaseConnectionWaitMs: 'DATABASE_CONNECTION_WAIT_MS',
      databaseWorkLongestMs: 'DATABASE_WORK_LONGEST_MS',
      databaseBusyRetrySeconds: 'DATABASE_BUSY_RETRY_SECONDS',
      passwordMinimumLength: 'PASSWORD_MINIMUM_LENGTH',
      passwordMaximumLength: 'PASSWORD_MAXIMUM_LENGTH',
      passwordResetMinutes: 'PASSWORD_RESET_MINUTES',
      accessTokenMinutes: 'ACCESS_TOKEN_MINUTES',
      sessionInactivityMinutes: 'SESSION_INACTIVITY_MINUTES',
      sessionOverallHours: 'SESSION_OVERALL_HOURS',
      signInTriesBeforeWait: 'SIGN_IN_TRIES_BEFORE_WAIT',
      signInTriesBeforeLock: 'SIGN_IN_TRIES_BEFORE_LOCK',
      signInFirstWaitSeconds: 'SIGN_IN_FIRST_WAIT_SECONDS',
      signInLongestWaitMinutes: 'SIGN_IN_LONGEST_WAIT_MINUTES',
      twoStepCodeStepsEitherSide: 'TWO_STEP_CODE_STEPS_EITHER_SIDE',
      twoStepSetupMinutes: 'TWO_STEP_SETUP_MINUTES',
      phoneChallengeSeconds: 'PHONE_CHALLENGE_SECONDS',
      phoneTokenMinutes: 'PHONE_TOKEN_MINUTES',
      monitorSessionHours: 'MONITOR_SESSION_HOURS',
      loginListEntriesPerCall: 'LOGIN_LIST_ENTRIES_PER_CALL',
      phoneSignInTriesBeforeWait: 'PHONE_SIGN_IN_TRIES_BEFORE_WAIT',
      phoneSignInTriesBeforeLock: 'PHONE_SIGN_IN_TRIES_BEFORE_LOCK',
      phoneSignInFirstWaitSeconds: 'PHONE_SIGN_IN_FIRST_WAIT_SECONDS',
      phoneSignInLongestWaitMinutes: 'PHONE_SIGN_IN_LONGEST_WAIT_MINUTES',
      phoneInactivityLockMinutes: 'PHONE_INACTIVITY_LOCK_MINUTES',
      phoneInactivityWarningSeconds: 'PHONE_INACTIVITY_WARNING_SECONDS',
      phoneSyncEveryMinutes: 'PHONE_SYNC_EVERY_MINUTES',
      addressLookupAnswerSeconds: 'ADDRESS_LOOKUP_ANSWER_SECONDS',
      mediaStoreAnswerSeconds: 'MEDIA_STORE_ANSWER_SECONDS',
      mediaFileBytesAtMost: 'MEDIA_FILE_BYTES_AT_MOST',
      mediaPartBytesAtMost: 'MEDIA_PART_BYTES_AT_MOST',
      mediaReceivingBytesAtMost: 'MEDIA_RECEIVING_BYTES_AT_MOST',
      rateLimitFilePartsPerPhone: 'RATE_LIMIT_FILE_PARTS_PER_PHONE',
      mapFileBytesAtMost: 'MAP_FILE_BYTES_AT_MOST',
      mapFileUnzippedBytesAtMost: 'MAP_FILE_UNZIPPED_BYTES_AT_MOST',
      mapFileEntriesAtMost: 'MAP_FILE_ENTRIES_AT_MOST',
      mapFileRingPairsAtMost: 'MAP_FILE_RING_PAIRS_AT_MOST',
      esriLayerAnswerSeconds: 'ESRI_LAYER_ANSWER_SECONDS',
      rateLimitWindowSeconds: 'RATE_LIMIT_WINDOW_SECONDS',
      rateLimitRequestsPerAddress: 'RATE_LIMIT_REQUESTS_PER_ADDRESS',
      rateLimitRequestsPerAccount: 'RATE_LIMIT_REQUESTS_PER_ACCOUNT',
      rateLimitRequestsPerPhone: 'RATE_LIMIT_REQUESTS_PER_PHONE',
      rateLimitCountsKept: 'RATE_LIMIT_COUNTS_KEPT',
      signInAddressWindowMinutes: 'SIGN_IN_ADDRESS_WINDOW_MINUTES',
      signInWrongTriesPerAddress: 'SIGN_IN_WRONG_TRIES_PER_ADDRESS',
      signInWrongTriesPerAddressAtLogin: 'SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN',
      passwordResetAsksPerAddress: 'PASSWORD_RESET_ASKS_PER_ADDRESS',
      passwordResetAsksPerLogin: 'PASSWORD_RESET_ASKS_PER_LOGIN',
      masterPasscodeMinimumLength: 'MASTER_PASSCODE_MINIMUM_LENGTH',
      masterPasscodeMaximumLength: 'MASTER_PASSCODE_MAXIMUM_LENGTH',
      phoneKeyRevokedAfterHours: 'PHONE_KEY_REVOKED_AFTER_HOURS',
      jobTriesBeforeSetAside: 'JOB_TRIES_BEFORE_SET_ASIDE',
      reconciliationRunLongestMinutes: 'RECONCILIATION_RUN_LONGEST_MINUTES',
      jobQueuePollSeconds: 'JOB_QUEUE_POLL_SECONDS',
      mapServerAnswerSeconds: 'MAP_SERVER_ANSWER_SECONDS',
      deviceClockOffLimitMinutes: 'DEVICE_CLOCK_OFF_LIMIT_MINUTES',
      jobTicketsAtMost: 'JOB_TICKETS_AT_MOST',
      phoneHeldBytesPerDay: 'PHONE_HELD_BYTES_PER_DAY',
      phoneHeldRecordsPerDay: 'PHONE_HELD_RECORDS_PER_DAY',
      mapFileReadSeconds: 'MAP_FILE_READ_SECONDS',
      mapFileReadMemoryMebibytes: 'MAP_FILE_READ_MEMORY_MEBIBYTES',
      fieldEventWaypointsAtMost: 'FIELD_EVENT_WAYPOINTS_AT_MOST',
    });
    expect(Object.keys(shipped).sort()).toEqual(Object.values(policyNames).sort());
  });

  it.each(Object.values(policyNames))(
    'AC-01-11 %s missing or blank stops the caller, by name: nothing stands in for it',
    (name) => {
      for (const without of [
        { ...shipped, [name]: undefined },
        { ...shipped, [name]: '  ' },
      ]) {
        expect(() => Policy.from(without)).toThrow(`The policy value ${name} is missing.`);
      }
    },
  );

  it.each(Object.values(policyNames))('%s is a whole number: no fraction, sign or word', (name) => {
    for (const written of ['5.5', '-5', '+5', 'five', '5%', '1e2']) {
      expect(() => Policy.from({ ...shipped, [name]: written }), written).toThrow(
        `The policy value ${name} must be a whole number`,
      );
    }
  });

  it('a load-call limit is a load call’s own range, 0 to 100', () => {
    for (const name of [policyNames.loadCallLowLimit, policyNames.loadCallHighLimit]) {
      expect(() => Policy.from({ ...shipped, [name]: '101' })).toThrow(
        `The policy value ${name} must be a whole number, from 0 to 100: "101".`,
      );
      for (const written of ['0', '100']) {
        expect(() => Policy.from({ ...shipped, [name]: written })).not.toThrow();
      }
    }
  });

  it('the site circle, the stump fill depth and a number block are sizes: at least one', () => {
    for (const name of [
      policyNames.siteCircleMeters,
      policyNames.stumpFillDepthInches,
      policyNames.ticketNumberBlockSize,
      policyNames.certNumberBlockSize,
      policyNames.roeNumberBlockSize,
    ]) {
      expect(() => Policy.from({ ...shipped, [name]: '0' })).toThrow(
        `The policy value ${name} must be a whole number, 1 or more: "0".`,
      );
      expect(() => Policy.from({ ...shipped, [name]: '1' })).not.toThrow();
    }
  });

  it('AC-05-51, ADR-504 the body a request may carry is a mebibyte unless changed, and never less: the heaviest sync a phone may send fits whatever an installation states', () => {
    expect(requestBodyBytesAtLeast).toBe(1_048_576);
    expect(Policy.from(shipped).requestBodyLimitBytes).toBe(requestBodyBytesAtLeast);
    expect(
      Policy.from({ ...shipped, REQUEST_BODY_LIMIT_BYTES: '2097152' }).requestBodyLimitBytes,
    ).toBe(2_097_152);
    for (const written of ['0', '1', '1048575']) {
      expect(() => Policy.from({ ...shipped, REQUEST_BODY_LIMIT_BYTES: written })).toThrow(
        `The policy value REQUEST_BODY_LIMIT_BYTES must be a whole number, 1048576 or more: "${written}".`,
      );
    }
  });

  it('AC-01-50 a crew day is 12 h unless changed: a day of 1 to 24 hours', () => {
    expect(Policy.from(shipped).crewDayHours).toBe(12);
    expect(Policy.from({ ...shipped, CREW_DAY_HOURS: '10' }).crewDayHours).toBe(10);
    for (const written of ['0', '25']) {
      expect(() => Policy.from({ ...shipped, CREW_DAY_HOURS: written })).toThrow(
        `The policy value CREW_DAY_HOURS must be a whole number, from 1 to 24: "${written}".`,
      );
    }
    for (const written of ['1', '24']) {
      expect(() => Policy.from({ ...shipped, CREW_DAY_HOURS: written })).not.toThrow();
    }
  });

  it('AC-10-42 a statement’s time limit is 30 s unless changed: a millisecond or more, never off, and no more than the database takes', () => {
    expect(Policy.from(shipped).statementTimeoutMs).toBe(30000);
    expect(Policy.from({ ...shipped, STATEMENT_TIMEOUT_MS: '120000' }).statementTimeoutMs).toBe(
      120000,
    );
    for (const written of ['0', '2147483648']) {
      expect(() => Policy.from({ ...shipped, STATEMENT_TIMEOUT_MS: written })).toThrow(
        `The policy value STATEMENT_TIMEOUT_MS must be a whole number, from 1 to 2147483647: "${written}".`,
      );
    }
    for (const written of ['1', '2147483647']) {
      expect(() => Policy.from({ ...shipped, STATEMENT_TIMEOUT_MS: written })).not.toThrow();
    }
  });

  it('AC-10-71 a piece of work waits 2 s for a connection and runs 5 s at most unless changed, and a caller told the database is busy waits 5 s; a shape of a shapefile pairs fifty million outer rings and holes at most; an Esri layer has 60 s (ADR-527): each held to its range (ADR-524)', () => {
    const policy = Policy.from(shipped);
    expect([
      policy.databaseConnectionWaitMs,
      policy.databaseWorkLongestMs,
      policy.databaseBusyRetrySeconds,
      policy.mapFileRingPairsAtMost,
      policy.esriLayerAnswerSeconds,
    ]).toEqual([2000, 5000, 5, 50_000_000, 60]);
    for (const [name, outside, inside, range] of [
      ['DATABASE_CONNECTION_WAIT_MS', ['99', '600001'], ['100', '600000'], 'from 100 to 600000'],
      [
        'DATABASE_WORK_LONGEST_MS',
        ['999', '2147483648'],
        ['1000', '2147483647'],
        'from 1000 to 2147483647',
      ],
      ['DATABASE_BUSY_RETRY_SECONDS', ['0', '3601'], ['1', '3600'], 'from 1 to 3600'],
      ['MAP_FILE_RING_PAIRS_AT_MOST', ['0'], ['1'], '1 or more'],
      ['ESRI_LAYER_ANSWER_SECONDS', ['0', '601'], ['1', '600'], 'from 1 to 600'],
    ] as const) {
      for (const written of outside) {
        expect(() => Policy.from({ ...shipped, [name]: written })).toThrow(
          `The policy value ${name} must be a whole number, ${range}: "${written}".`,
        );
      }
      for (const written of inside) {
        expect(() => Policy.from({ ...shipped, [name]: written })).not.toThrow();
      }
    }
  });

  it('AC-10-21 a password’s shortest length is 15 unless changed: never under the standard’s 8, never over the 64 it says must be permitted; its longest never under those 64', () => {
    const policy = Policy.from(shipped);
    expect([policy.passwordMinimumLength, policy.passwordMaximumLength]).toEqual([15, 128]);
    for (const written of ['7', '65']) {
      expect(() => Policy.from({ ...shipped, PASSWORD_MINIMUM_LENGTH: written })).toThrow(
        `The policy value PASSWORD_MINIMUM_LENGTH must be a whole number, from 8 to 64: "${written}".`,
      );
    }
    for (const written of ['63', '1025']) {
      expect(() => Policy.from({ ...shipped, PASSWORD_MAXIMUM_LENGTH: written })).toThrow(
        `The policy value PASSWORD_MAXIMUM_LENGTH must be a whole number, from 64 to 1024: "${written}".`,
      );
    }
    expect(Policy.from({ ...shipped, PASSWORD_MINIMUM_LENGTH: '8' }).passwordMinimumLength).toBe(8);
  });

  it('AC-10-25 a reset by email is good for an hour unless changed: a minute or more, a day at most', () => {
    expect(Policy.from(shipped).passwordResetMinutes).toBe(60);
    for (const written of ['0', '1441']) {
      expect(() => Policy.from({ ...shipped, PASSWORD_RESET_MINUTES: written })).toThrow(
        `The policy value PASSWORD_RESET_MINUTES must be a whole number, from 1 to 1440: "${written}".`,
      );
    }
    expect(Policy.from({ ...shipped, PASSWORD_RESET_MINUTES: '1440' }).passwordResetMinutes).toBe(
      1440,
    );
  });

  it('are read as written, spaces round a value aside', () => {
    expect(Policy.from({ ...shipped, LOAD_CALL_LOW_LIMIT: ' 5 ' }).loadCallLowLimit).toBe(5);
  });
});
