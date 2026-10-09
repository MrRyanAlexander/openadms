// What wrong tries at a login cost (ARCHITECTURE §6, Abuse; spec/acceptance/10-api-and-sync.md
// AC-10-18; spec/THREAT-MODEL.md T-16; ADR-409): NIST SP 800-63B-4 §3.2.2. Wrong tries in a row
// are counted on the person's own sign-in record. From the policy's first count each one puts a
// wait on the login, twice as long as the one before and never over the policy's longest; at the
// policy's second count the login is locked, and stays so until its password is set anew. A
// sign-in that works, or a password set anew, starts the count again. While a login waits or is
// locked the right password is refused too, so a guess made then tells nothing.
import type { Policy } from './policy.ts';

export type SignInTriesPolicy = Pick<
  Policy,
  | 'signInTriesBeforeWait'
  | 'signInTriesBeforeLock'
  | 'signInFirstWaitSeconds'
  | 'signInLongestWaitMinutes'
>;

// What one more wrong try does to a login.
export type WrongTry =
  | { readonly kind: 'COUNTED' }
  | { readonly kind: 'WAIT'; readonly until: Date }
  | { readonly kind: 'LOCKED' };

export class SignInTries {
  private readonly policy: SignInTriesPolicy;

  constructor(policy: SignInTriesPolicy) {
    this.policy = policy;
  }

  // Whether a login with that many wrong tries in a row is locked.
  locked(wrongInARow: number): boolean {
    return wrongInARow >= this.policy.signInTriesBeforeLock;
  }

  // Whether a login may not be tried at this moment: it is locked, or its wait isn't over.
  closed(wrongInARow: number, waitUntil: Date | null, now: Date): boolean {
    return this.locked(wrongInARow) || (waitUntil !== null && waitUntil.getTime() > now.getTime());
  }

  // What the wrong try that brings the count to `wrongInARow` does.
  after(wrongInARow: number, now: Date): WrongTry {
    if (this.locked(wrongInARow)) return { kind: 'LOCKED' };
    const over = wrongInARow - this.policy.signInTriesBeforeWait;
    if (over < 0) return { kind: 'COUNTED' };
    const longest = this.policy.signInLongestWaitMinutes * 60;
    // Doubled one try at a time, so a count far past the first never overflows.
    let seconds = this.policy.signInFirstWaitSeconds;
    for (let doubled = 0; doubled < over && seconds < longest; doubled += 1) seconds *= 2;
    return { kind: 'WAIT', until: new Date(now.getTime() + Math.min(seconds, longest) * 1000) };
  }
}

// Wrong tries at the firm's master passcode, when a phone is enrolled (ARCHITECTURE §7.5;
// spec/acceptance/10-api-and-sync.md AC-10-22; ADR-438): sign-in's rule and sign-in's numbers,
// counted against the passcode's version in force. The lock stays until the firm changes the
// passcode: a new version has no wrong tries. Phones already enrolled keep working, since their
// own check of the passcode is on the phone.
export class MasterPasscodeTries extends SignInTries {}
