// Two-step sign-in's rules (ARCHITECTURE §6; AC-02-14, 74; AC-10-26; ADR-170, 412): who needs a
// second step, and which codes are taken in when. NIST SP 800-63B-4 §3.1.4.2; ASVS 6.5.1, 6.5.5.
import { describe, expect, it } from 'vitest';

import { TwoStepRules, twoStepCode } from '../src/index.ts';

const shipped = { twoStepCodeStepsEitherSide: 1, twoStepSetupMinutes: 10 };
// Monday 12 October 2026, 10:00:10 in Bayline County: ten seconds into a step.
const now = new Date('2026-10-12T14:00:10Z');
const own = Math.floor(now.getTime() / 30_000);

describe('two-step sign-in', () => {
  const rules = new TwoStepRules(shipped);

  it('AC-02-14 is required for an admin and a manager/analyst, optional for a read-only viewer, and a monitor has none', () => {
    expect(
      ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER', 'MONITOR', 'SYSTEM', 'ANYTHING_ELSE'].map(
        (role) => rules.need(role, false),
      ),
    ).toEqual(['REQUIRED', 'REQUIRED', 'OPTIONAL', 'NONE', 'NONE', 'NONE']);
  });

  it('AC-10-85 is required for a read-only viewer too where the firm says so, and still none for a monitor', () => {
    expect(
      ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER', 'MONITOR', 'SYSTEM'].map((role) =>
        rules.need(role, true),
      ),
    ).toEqual(['REQUIRED', 'REQUIRED', 'REQUIRED', 'NONE', 'NONE']);
  });

  it('a code is six digits that change every thirty seconds, as every authenticator app makes them', () => {
    expect(twoStepCode).toEqual({ digits: 6, stepSeconds: 30 });
    expect(rules.stepAt(new Date(0))).toBe(0);
    expect(rules.stepAt(new Date(29_999))).toBe(0);
    expect(rules.stepAt(new Date(30_000))).toBe(1);
    expect(rules.stepAt(now)).toBe(own);
  });

  it('takes in the code of the server’s own step and of one step either side, the server’s own first', () => {
    expect(rules.stepsTaken(now, null)).toEqual([own, own - 1, own + 1]);
  });

  it('with the policy’s steps at nought, takes in the server’s own step alone', () => {
    const strict = new TwoStepRules({ ...shipped, twoStepCodeStepsEitherSide: 0 });
    expect(strict.stepsTaken(now, null)).toEqual([own]);
  });

  it('a code is good once: none is taken at or before the step of the last one taken', () => {
    expect(rules.stepsTaken(now, own - 2)).toEqual([own, own - 1, own + 1]);
    expect(rules.stepsTaken(now, own - 1)).toEqual([own, own + 1]);
    expect(rules.stepsTaken(now, own)).toEqual([own + 1]);
    expect(rules.stepsTaken(now, own + 1)).toEqual([]);
  });

  it('reads a code as typed, with the spaces an app shows; anything else is no code', () => {
    expect(rules.typed('287082')).toBe('287082');
    expect(rules.typed(' 287 082 ')).toBe('287082');
    for (const not of ['', '28708', '2870821', '28708a', '２８７０８２', '-87082', '287.082']) {
      expect(rules.typed(not)).toBeUndefined();
    }
  });

  it('a setup is finished within the policy’s minutes', () => {
    expect(rules.setupEnds(now)).toEqual(new Date('2026-10-12T14:10:10Z'));
  });
});
