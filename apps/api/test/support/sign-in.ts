// Sign-in's services as the process puts them together (api-process.ts), for a test that calls
// one directly: on the test's own database, mail and clock, with a made-up signing secret.
import type { Database } from '@open-adms/db';
import { PasswordRules, SignInTries, TwoStepRules } from '@open-adms/domain';

import type { Clock } from '../../src/setup/setup-service.ts';
import { shippedBreachedPasswords } from '../../src/sign-in/breached-list.ts';
import type { Mail, Message } from '../../src/sign-in/mail.ts';
import { OneTimeCodes } from '../../src/sign-in/one-time-codes.ts';
import { PasswordHasher } from '../../src/sign-in/password-hasher.ts';
import { OfflineChecks } from '../../src/phone/offline-checks.ts';
import { Passwords } from '../../src/sign-in/passwords.ts';
import { ResetCodes } from '../../src/sign-in/reset-codes.ts';
import { SessionTokens } from '../../src/sign-in/session-tokens.ts';
import { Sessions } from '../../src/sign-in/sessions.ts';
import { TwoStepSecrets } from '../../src/sign-in/two-step-secrets.ts';
import { TwoStep, TwoStepCheck } from '../../src/sign-in/two-step.ts';
import { WrongTries } from '../../src/sign-in/wrong-tries.ts';
import { shippedPolicy } from './process.ts';

export const signingSecret = 'made-up-signing-secret-for-this-test-only';

// What the firm's mail server would have been handed.
export class Outbox implements Mail {
  readonly available = true;
  readonly sent: Message[] = [];

  send(message: Message): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class NoServer implements Mail {
  readonly available = false;

  send(): Promise<void> {
    return Promise.reject(new Error('no mail server'));
  }
}

// Monday 12 October 2026, 10:00 in Bayline County; a test moves it on.
export class TestClock implements Clock {
  at = new Date('2026-10-12T14:00:00Z');

  now(): Date {
    return this.at;
  }

  later(minutes: number): void {
    this.at = new Date(this.at.getTime() + minutes * 60_000);
  }
}

export interface SignIn {
  readonly hasher: PasswordHasher;
  readonly tokens: SessionTokens;
  readonly sessions: Sessions;
  readonly passwords: Passwords;
  readonly check: TwoStepCheck;
  readonly twoStep: TwoStep;
}

export function signInOn(
  within: Database,
  mail: Mail,
  clock: Clock = new TestClock(),
  policy = shippedPolicy,
): SignIn {
  const hasher = new PasswordHasher(signingSecret);
  const tokens = new SessionTokens(signingSecret, policy.accessTokenMinutes);
  const requestNow = (): undefined => undefined;
  const tries = new WrongTries(within, { rules: new SignInTries(policy), clock, mail, requestNow });
  const check = new TwoStepCheck(
    new TwoStepRules(policy),
    new OneTimeCodes(),
    new TwoStepSecrets(signingSecret),
  );
  const sessions = new Sessions(within, {
    tokens,
    hasher,
    tries,
    twoStep: check,
    clock,
    policy,
    requestNow,
  });
  const twoStep = new TwoStep(within, { check, clock, mail, sessions, tries, requestNow });
  const passwords = new Passwords(within, {
    rules: new PasswordRules(policy, shippedBreachedPasswords()),
    hasher,
    resetCodes: new ResetCodes(signingSecret, policy.passwordResetMinutes),
    mail,
    clock,
    resetMinutes: policy.passwordResetMinutes,
    sessions,
    tries,
    limits: { setAnew: () => undefined },
    offline: new OfflineChecks(signingSecret),
  });
  return { hasher, tokens, sessions, passwords, check, twoStep };
}
