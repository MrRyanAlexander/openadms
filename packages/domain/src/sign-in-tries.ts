// What wrong tries at a login cost (ARCHITECTURE §6, Abuse; spec/acceptance/10-api-and-sync.md
// AC-10-18; spec/THREAT-MODEL.md T-16; ADR-409): NIST SP 800-63B-4 §3.2.2. Wrong tries in a row
// are counted on the person's own sign-in record. From the policy's first count each one puts a
// wait on the login, twice as long as the one before and never over the policy's longest; at the
// policy's second count the login is locked, and stays so until its password is set anew. A
// sign-in that works, or a password set anew, starts the count again. While a login waits or is
// locked the right password is refused too, so a guess made then tells nothing.
import type { Policy } from './policy.ts';

// The phone's own count at its sign-in screen (ARCHITECTURE §7.2 (3); NIST SP 800-63B-4 §3.2.10;
// ADR-139, 575): the same rule with the phone's numbers, its lock lifted by the master passcode.
export type PhoneSignInTriesPolicy = Pick<
  Policy,
  | 'phoneSignInTriesBeforeWait'
  | 'phoneSignInTriesBeforeLock'
  | 'phoneSignInFirstWaitSeconds'
  | 'phoneSignInLongestWaitMinutes'
>;

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

  // Wrong tries at a phone's own sign-in screen, checked against its login list.
  static onPhone(policy: PhoneSignInTriesPolicy): SignInTries {
    return new SignInTries({
      signInTriesBeforeWait: policy.phoneSignInTriesBeforeWait,
      signInTriesBeforeLock: policy.phoneSignInTriesBeforeLock,
      signInFirstWaitSeconds: policy.phoneSignInFirstWaitSeconds,
      signInLongestWaitMinutes: policy.phoneSignInLongestWaitMinutes,
    });
  }

  // Whether a login with that many wrong tries in a row is locked.
  locked(wrongInARow: number): boolean {
    return wrongInARow >= this.policy.signInTriesBeforeLock;
  }

  // Whether the wrong try that brings the count to `wrongInARow` is the one that puts the first
  // wait on the login: where the master passcode's admins are told it is being tried (ADR-541).
  firstWait(wrongInARow: number): boolean {
    return !this.locked(wrongInARow) && wrongInARow === this.policy.signInTriesBeforeWait;
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
// spec/acceptance/10-api-and-sync.md AC-10-22; ADR-438, 541): sign-in's rule and sign-in's
// numbers, counted against the passcode's version in force. The lock stays until the firm changes
// the passcode: a new version has no wrong tries. Phones already enrolled keep working, since
// their own check of the passcode is on the phone. **Its wait holds only an address that has
// tried it wrong** (ADR-541): the passcode is one value for the whole firm, so a wait on it that
// refused everybody would let one stranger keep every supervisor out; `closedTo` says so.
export class MasterPasscodeTries extends SignInTries {
  // Whether the passcode may not be tried now by somebody whose address has (`refusedThere`) or
  // hasn't been refused at it lately: the lock refuses everybody, the wait only the former.
  closedTo(wrongInARow: number, waitUntil: Date | null, now: Date, refusedThere: boolean): boolean {
    return (
      this.locked(wrongInARow) ||
      (refusedThere && waitUntil !== null && waitUntil.getTime() > now.getTime())
    );
  }
}
