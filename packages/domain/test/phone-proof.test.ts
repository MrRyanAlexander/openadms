// A phone's proof of itself: what it signs, and when a challenge is still good (ARCHITECTURE
// §7.4; AC-05-03, AC-10-45; T-02, T-11; ADR-437). NIST SP 800-63B-4 §3.1.6.2.
import { describe, expect, it } from 'vitest';

import { phoneKeyKind, PhoneProofRules } from '../src/index.ts';

const rules = new PhoneProofRules({ phoneChallengeSeconds: 120 });
const made = new Date('2026-10-12T16:05:00.000Z');
const after = (milliseconds: number): Date => new Date(made.getTime() + milliseconds);

describe('a phone’s proof of itself', () => {
  it('is an ECDSA signature on P-256 with SHA-256', () => {
    expect(phoneKeyKind).toEqual({ algorithm: 'ECDSA', curve: 'P-256', hash: 'SHA-256' });
  });

  it('signs the label, a line break and the challenge as it was sent', () => {
    expect(PhoneProofRules.signed('abc.def')).toBe('open-adms/phone-proof/v1\nabc.def');
  });

  it('answers a challenge made with 256 random bits', () => {
    expect(PhoneProofRules.nonceBytes).toBe(32);
  });

  it('AC-10-45 takes a challenge only while the policy’s time runs', () => {
    expect(rules.live(made, made)).toBe(true);
    expect(rules.live(made, after(119_999))).toBe(true);
    expect(rules.live(made, after(120_000))).toBe(false);
    expect(new PhoneProofRules({ phoneChallengeSeconds: 10 }).live(made, after(10_000))).toBe(
      false,
    );
  });

  it('AC-10-45 takes a challenge once: only one made after the last the phone answered', () => {
    expect(rules.unspent(made, null)).toBe(true);
    expect(rules.unspent(made, after(-1))).toBe(true);
    // The same one again, and one made before it.
    expect(rules.unspent(made, made)).toBe(false);
    expect(rules.unspent(made, after(1))).toBe(false);
  });
});
