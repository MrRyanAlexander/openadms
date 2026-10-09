// The release's policy values (packages/domain/policy.env; invariant 16; ADR-303): the file holds
// exactly the built-in defaults the decisions name, under the domain's names, and a new project's
// settings start from them (spec/acceptance/01-setup.md AC-01-06, AC-01-11). Needs no database.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { NewProjectSettings, policyNames } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { builtInPolicy } from '../src/policy.ts';

const policyFile = new URL('../../domain/policy.env', import.meta.url);

describe('the release’s policy values', () => {
  it('AC-01-11 are the built-in defaults: load calls flagged at or under 5 and at or over 95 (ADR-164), a 200 m site circle (ADR-142), a 31 in stump fill depth (ADR-203); AC-01-50 a 12 h crew day (ADR-087); AC-04-04, AC-03-06 blocks of 1,000 ticket numbers and 100 cert numbers (ADR-065, 181), 100 ROE numbers (ADR-323); AC-10-39 a request’s body of one mebibyte at most (ADR-389); AC-10-42 a statement of a service’s database login stopped after 30 s (ADR-394); AC-10-21 a password of 15 to 128 characters (ADR-402); AC-10-25 a reset by email good for an hour (ADR-404); AC-10-12 an access token of 5 minutes, a session of 30 quiet minutes and 12 hours at most (ADR-408); AC-10-18 a wait after 5 wrong tries in a row, from 30 s to an hour, and a lock after 50 (ADR-409, 417); AC-10-40 3,000 requests a minute from one address and 600 from one person, 100,000 counts kept; in an hour 30 refused tries from one address and 4 at one login, 10 resets asked by one address and 3 for one login (ADR-416); a job set aside after 5 tries (ADR-418), a run of 10 minutes at most, the queue looked at every 5 s, a map server given 30 s to answer, a pool of 10 connections for each service (ADR-419); AC-10-45 a phone’s challenge good for 120 s (ADR-437)', () => {
    const policy = builtInPolicy();
    expect([
      policy.loadCallLowLimit,
      policy.loadCallHighLimit,
      policy.siteCircleMeters,
      policy.stumpFillDepthInches,
      policy.crewDayHours,
      policy.ticketNumberBlockSize,
      policy.certNumberBlockSize,
      policy.roeNumberBlockSize,
      policy.requestBodyLimitBytes,
      policy.statementTimeoutMs,
      policy.passwordMinimumLength,
      policy.passwordMaximumLength,
      policy.passwordResetMinutes,
      policy.accessTokenMinutes,
      policy.sessionInactivityMinutes,
      policy.sessionOverallHours,
      policy.signInTriesBeforeWait,
      policy.signInTriesBeforeLock,
      policy.signInFirstWaitSeconds,
      policy.signInLongestWaitMinutes,
      policy.rateLimitWindowSeconds,
      policy.rateLimitRequestsPerAddress,
      policy.rateLimitRequestsPerAccount,
      policy.rateLimitCountsKept,
      policy.signInAddressWindowMinutes,
      policy.signInWrongTriesPerAddress,
      policy.signInWrongTriesPerAddressAtLogin,
      policy.passwordResetAsksPerAddress,
      policy.passwordResetAsksPerLogin,
      policy.jobTriesBeforeSetAside,
      policy.reconciliationRunLongestMinutes,
      policy.jobQueuePollSeconds,
      policy.mapServerAnswerSeconds,
      policy.databasePoolConnections,
      policy.jobTicketsAtMost,
      policy.phoneChallengeSeconds,
      policy.phoneTokenMinutes,
      policy.monitorSessionHours,
    ]).toEqual([
      5, 95, 200, 31, 12, 1000, 100, 100, 1048576, 30000, 15, 128, 60, 5, 30, 12, 5, 50, 30, 60, 60,
      3000, 600, 100000, 60, 30, 4, 10, 3, 5, 10, 5, 30, 10, 200, 120, 15, 12,
    ]);
  });

  it('are written in the env file under the domain’s names, and nothing else is in it', () => {
    const written = parseEnv(readFileSync(policyFile, 'utf8'));
    expect(Object.keys(written).sort()).toEqual(Object.values(policyNames).sort());
  });

  it('AC-01-11 a new project starts with them, and with both stump checks on; AC-01-06 Allow split loads only where the program type requires ROEs', () => {
    const settings = new NewProjectSettings(builtInPolicy());
    const starts = {
      loadCallLowLimit: 5,
      loadCallHighLimit: 95,
      stumpFillDepthInches: 31,
      stumpCheckRootBallWider: true,
      stumpCheckFillNeedsExposure: true,
      siteCircleMeters: 200,
      timeClockEnabled: false,
    };
    expect(settings.for({ requiresRoe: false })).toEqual({ ...starts, allowSplitLoads: false });
    expect(settings.for({ requiresRoe: true })).toEqual({ ...starts, allowSplitLoads: true });
  });
});
