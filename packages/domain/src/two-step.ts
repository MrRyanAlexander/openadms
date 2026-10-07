// Two-step sign-in: who needs it, and which of an authenticator's codes is taken in when
// (ARCHITECTURE §6; spec/acceptance/02-people-and-devices.md AC-02-14, 74;
// spec/acceptance/10-api-and-sync.md AC-10-26; spec/THREAT-MODEL.md T-14, T-16; ADR-170, 412).
// NIST SP 800-63B-4 §3.1.4, §3.1.5; OWASP ASVS 5.0 §6.5; RFC 6238.
//
// - **Who.** An admin and a manager/analyst must have it; a read-only viewer may choose it; a
//   monitor has none (the enrolled phone is their protection) and the system actor is no login.
// - **The code** is the time-based one every authenticator app makes: six digits that change
//   every thirty seconds, counted from 1970 in steps. Those two numbers are what the apps take,
//   so they are the code's own shape, never a policy value.
// - **When one is taken in.** The code of the server's own step, and of the policy's steps
//   before and after it (a phone's clock runs a little off, and typing takes time). A code is
//   good once: none is taken at or before the step of the last one taken, so neither the same
//   code again nor an older one that somebody watched being typed opens anything.
//
// The arithmetic of a code (an HMAC) is the server's, where its secret is: apps/api.
import type { Policy } from './policy.ts';

export type TwoStepNeed = 'REQUIRED' | 'OPTIONAL' | 'NONE';

export type TwoStepPolicy = Pick<Policy, 'twoStepCodeStepsEitherSide' | 'twoStepSetupMinutes'>;

// What every authenticator app makes (RFC 6238's own defaults).
export const twoStepCode = { digits: 6, stepSeconds: 30 } as const;

const needs: Readonly<Record<string, TwoStepNeed>> = {
  ADMIN: 'REQUIRED',
  MANAGER_ANALYST: 'REQUIRED',
  READ_ONLY_VIEWER: 'OPTIONAL',
};

export class TwoStepRules {
  private readonly policy: TwoStepPolicy;

  constructor(policy: TwoStepPolicy) {
    this.policy = policy;
  }

  // Whether a person of that role must have a second step, may, or has none.
  need(role: string): TwoStepNeed {
    return needs[role] ?? 'NONE';
  }

  // The step a moment falls in.
  stepAt(now: Date): number {
    return Math.floor(now.getTime() / (twoStepCode.stepSeconds * 1000));
  }

  // The steps whose code is taken in at `now`, the server's own first: never one at or before
  // the step of the last code taken from this person.
  stepsTaken(now: Date, lastTaken: number | null): readonly number[] {
    const own = this.stepAt(now);
    const steps = [own];
    for (let away = 1; away <= this.policy.twoStepCodeStepsEitherSide; away += 1) {
      steps.push(own - away, own + away);
    }
    return steps.filter((step) => step >= 0 && (lastTaken === null || step > lastTaken));
  }

  // A code as typed, without the spaces an app shows it with; undefined when it isn't one.
  typed(code: string): string | undefined {
    const digits = code.replace(/\s+/g, '');
    return new RegExp(`^\\d{${String(twoStepCode.digits)}}$`).test(digits) ? digits : undefined;
  }

  // When a setup begun at `now` must be finished by.
  setupEnds(now: Date): Date {
    return new Date(now.getTime() + this.policy.twoStepSetupMinutes * 60_000);
  }
}
