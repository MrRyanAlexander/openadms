// A phone's proof of itself (ARCHITECTURE §7.4; spec/acceptance/02-people-and-devices.md
// AC-02-18; spec/acceptance/05-sync.md AC-05-03; spec/acceptance/10-api-and-sync.md AC-10-44, 45;
// spec/THREAT-MODEL.md T-02, T-11; ADR-436, 437): NIST SP 800-63B-4 §3.1.6 (single-factor
// cryptographic authentication), OWASP ASVS 5.0 6.7.2, 11.2.3, 11.6.1.
//
// - **The key's kind.** At enrolment a phone makes an ECDSA key pair on the curve P-256 and the
//   server is sent its public half only. It is the one kind an iPhone's Secure Enclave makes, an
//   Android's Keystore makes in its own hardware too, and Node checks with nothing added; its
//   strength is 128 bits. A proof is an ECDSA signature with SHA-256.
// - **What a phone signs** is the same on the phone and the server, so it is said here once: this
//   package's label, a line break, then the challenge exactly as the server sent it. The label
//   keeps a signature made as a proof from ever being taken as anything else the key may sign.
// - **A challenge is good once and not for long.** The server makes each one with 256 random
//   bits, and takes a signed one back only while the policy's time runs, and only if it was made
//   after the last one that phone proved itself with: a recorded proof sent again proves nothing.
import type { Policy } from './policy.ts';

export type PhoneProofPolicy = Pick<Policy, 'phoneChallengeSeconds'>;

// The key pair a phone makes at enrolment, and how it signs.
export const phoneKeyKind = { algorithm: 'ECDSA', curve: 'P-256', hash: 'SHA-256' } as const;

export class PhoneProofRules {
  static readonly label = 'open-adms/phone-proof/v1';
  // The random part of a challenge, in bytes: far over the 64 bits the standard asks.
  static readonly nonceBytes = 32;

  private readonly policy: PhoneProofPolicy;

  constructor(policy: PhoneProofPolicy) {
    this.policy = policy;
  }

  // The text a phone signs to answer a challenge.
  static signed(challenge: string): string {
    return `${PhoneProofRules.label}\n${challenge}`;
  }

  // Whether a challenge made at that moment may still be answered now.
  live(madeAt: Date, now: Date): boolean {
    return now.getTime() - madeAt.getTime() < this.policy.phoneChallengeSeconds * 1000;
  }

  // Whether a challenge made at that moment is one the phone has not yet proved itself with, or
  // passed by: only one made after the last it answered is taken.
  unspent(madeAt: Date, lastAnsweredMadeAt: Date | null): boolean {
    return lastAnsweredMadeAt === null || madeAt.getTime() > lastAnsweredMadeAt.getTime();
  }
}
