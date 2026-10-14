// An authenticator's codes and how its secret is kept (ARCHITECTURE §6; AC-10-11, 26; T-26, T-43;
// ADR-412): RFC 4226 and RFC 6238's own test values, and the sealing. NIST SP 800-63B-4
// §3.1.4; ASVS 6.5.3. Nothing here needs the stack.
import { describe, expect, it } from 'vitest';

import { OneTimeCodes } from '../src/sign-in/one-time-codes.ts';
import { TwoStepSecrets } from '../src/sign-in/two-step-secrets.ts';

const codes = new OneTimeCodes();
// The secret both RFCs test with, and what an app is given for it.
const secret = Buffer.from('12345678901234567890');
const dana = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d01';
const luis = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d02';
const now = new Date('2026-10-12T14:00:00Z');

describe('an authenticator’s codes', () => {
  it('are RFC 4226’s for each count (its Appendix D)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => codes.codeAt(secret, count))).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ]);
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('are RFC 6238’s at %i seconds: the last six digits of its Appendix B', (seconds, expected) => {
    expect(codes.codeAt(secret, Math.floor(seconds / 30))).toBe(expected);
  });

  it('says which of the steps tried a code belongs to, and none for any other code', () => {
    expect(codes.stepOf(secret, '359152', [3, 2, 1])).toBe(2);
    expect(codes.stepOf(secret, '359152', [3, 1])).toBeUndefined();
    expect(codes.stepOf(secret, '359152', [])).toBeUndefined();
    expect(codes.stepOf(secret, '35915', [2])).toBeUndefined();
    expect(codes.stepOf(secret, '3591520', [2])).toBeUndefined();
    expect(codes.stepOf(Buffer.from('09876543210987654321'), '359152', [2])).toBeUndefined();
  });

  it('a new secret is twenty random bytes, never the same twice (ASVS 6.5.3)', () => {
    const made = [codes.newSecret(), codes.newSecret()];
    expect(made.map((one) => one.length)).toEqual([20, 20]);
    expect(made[0]?.equals(made[1] ?? Buffer.alloc(0))).toBe(false);
  });

  it('gives an app the secret as base32, and as the address a QR code holds', () => {
    expect(codes.base32(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codes.base32(Buffer.from('f'))).toBe('MY');
    expect(codes.base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(codes.uri(secret, 'dana.reyes@gates.example')).toBe(
      // secretlint-disable-next-line -- RFC 6238's test secret, which nobody's app holds
      'otpauth://totp/Open%20ADMS:dana.reyes%40gates.example?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Open%20ADMS&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('an authenticator’s secret, as the server keeps it', () => {
  const secrets = new TwoStepSecrets('made-up-signing-secret-for-this-test-only');

  it('AC-10-11 is sealed: what is kept holds the secret in no form, and opens only for the person it was sealed for', () => {
    const kept = secrets.seal(dana, secret);
    expect(kept).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$/);
    for (const form of ['utf8', 'hex', 'base64', 'base64url'] as const) {
      expect(kept).not.toContain(secret.toString(form));
    }
    expect(kept).not.toContain(codes.base32(secret));
    expect(secrets.open(dana, kept)?.equals(secret)).toBe(true);
    // Put on another person's row, it opens nothing.
    expect(secrets.open(luis, kept)).toBeUndefined();
    // Sealed twice, it is never the same text.
    expect(secrets.seal(dana, secret)).not.toBe(kept);
  });

  it('opens nothing that was altered, that another installation sealed, or that isn’t sealed at all', () => {
    const kept = secrets.seal(dana, secret);
    const [version = '', nonce = '', hidden = '', tag = ''] = kept.split('.');
    const flipped = (text: string): string => (text.startsWith('A') ? 'B' : 'A') + text.slice(1);
    for (const altered of [
      [version, flipped(nonce), hidden, tag],
      [version, nonce, flipped(hidden), tag],
      [version, nonce, hidden, flipped(tag)],
      ['v2', nonce, hidden, tag],
      [version, nonce, hidden],
      [version, nonce, hidden, tag, tag],
    ]) {
      expect(secrets.open(dana, altered.join('.')), altered.join('.')).toBeUndefined();
    }
    expect(new TwoStepSecrets('another-installation’s-secret').open(dana, kept)).toBeUndefined();
    expect(secrets.open(dana, codes.base32(secret))).toBeUndefined();
    expect(secrets.open(dana, '')).toBeUndefined();
  });

  it('a setup carries the secret back only for the person it was begun for, and only until it runs out', () => {
    const until = new Date(now.getTime() + 10 * 60_000);
    const setup = secrets.setup(dana, secret, until);
    expect(setup).not.toContain(codes.base32(secret));
    expect(secrets.readSetup(dana, setup, now)?.equals(secret)).toBe(true);
    expect(secrets.readSetup(dana, setup, new Date(until.getTime() - 1))?.equals(secret)).toBe(
      true,
    );
    expect(secrets.readSetup(dana, setup, until)).toBeUndefined();
    expect(secrets.readSetup(luis, setup, now)).toBeUndefined();
    // A setup is not what is kept, nor the other way about: each has a key of its own.
    expect(secrets.open(dana, `v1.${setup}`)).toBeUndefined();
    expect(
      secrets.readSetup(dana, secrets.seal(dana, secret).split('.').slice(1).join('.'), now),
    ).toBeUndefined();
    expect(secrets.readSetup(dana, 'made.up.setup', now)).toBeUndefined();
  });
});
