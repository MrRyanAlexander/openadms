// What a new project's settings start as (spec/acceptance/01-setup.md AC-01-06, AC-01-11;
// REQ-105d, 124d; invariant 16; ADR-303). The numbers are policy values the caller hands over,
// never written in the rule. That the release's own env file (packages/domain/policy.env) holds
// exactly the values used here is held by packages/scenarios/test/policy.test.ts, which may read a
// file; this package's tests, like its source, read none.
import { describe, expect, it } from 'vitest';

import { NewProjectSettings, Policy, policyNames } from '../src/index.ts';

// The policy values as the release ships them.
const shipped = {
  LOAD_CALL_LOW_LIMIT: '5',
  LOAD_CALL_HIGH_LIMIT: '95',
  DISPOSAL_SITE_PROXIMITY_M: '200',
  STUMP_FILL_DEPTH_INCHES: '31',
  CREW_DAY_HOURS: '12',
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
  it('are five, each under its own name in the environment', () => {
    expect(policyNames).toEqual({
      loadCallLowLimit: 'LOAD_CALL_LOW_LIMIT',
      loadCallHighLimit: 'LOAD_CALL_HIGH_LIMIT',
      siteCircleMeters: 'DISPOSAL_SITE_PROXIMITY_M',
      stumpFillDepthInches: 'STUMP_FILL_DEPTH_INCHES',
      crewDayHours: 'CREW_DAY_HOURS',
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

  it('the site circle and the stump fill depth are sizes: at least one', () => {
    for (const name of [policyNames.siteCircleMeters, policyNames.stumpFillDepthInches]) {
      expect(() => Policy.from({ ...shipped, [name]: '0' })).toThrow(
        `The policy value ${name} must be a whole number, 1 or more: "0".`,
      );
      expect(() => Policy.from({ ...shipped, [name]: '1' })).not.toThrow();
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

  it('are read as written, spaces round a value aside', () => {
    expect(Policy.from({ ...shipped, LOAD_CALL_LOW_LIMIT: ' 5 ' }).loadCallLowLimit).toBe(5);
  });
});
