// An authenticator app's codes (ARCHITECTURE §6; AC-02-14; AC-10-26; T-14, T-16; ADR-170, 412):
// the time-based one-time password of RFC 6238 over RFC 4226, as every authenticator app makes
// it. The app and the server hold one secret; each turns the count of thirty-second steps since
// 1970 into six digits with HMAC-SHA-1, and the server takes a code in when it is the one it
// works out itself. Node's own crypto; no dependency.
//
// - **The secret** is 20 random bytes (160 bits) from the system's random source: RFC 4226's
//   length, over the 112 bits NIST SP 800-63B-4 §3.1.4.1 asks, made as ASVS 6.5.3 asks.
// - **HMAC-SHA-1**, because it is the one algorithm every authenticator app takes: several
//   ignore a request for another and would show codes the server never accepts. As a keyed
//   hash with a 160-bit key it keeps the strength the standard asks (SHA-1's weakness is in
//   collisions, which an HMAC doesn't rest on).
// - Which steps are tried, and that a code is good once, is the domain's rule (TwoStepRules).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { twoStepCode } from '@open-adms/domain';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class OneTimeCodes {
  static readonly secretBytes = 20;

  newSecret(): Buffer {
    return randomBytes(OneTimeCodes.secretBytes);
  }

  // The code of one step (RFC 4226 §5.3: the HMAC of the count, cut dynamically to 31 bits).
  codeAt(secret: Buffer, step: number): string {
    const count = Buffer.alloc(8);
    count.writeBigUInt64BE(BigInt(step));
    const mac = createHmac('sha1', secret).update(count).digest();
    const at = (mac.at(-1) ?? 0) & 0x0f;
    const number = mac.readUInt32BE(at) & 0x7fffffff;
    return String(number % 10 ** twoStepCode.digits).padStart(twoStepCode.digits, '0');
  }

  // The step, among those given, whose code this is. Every step is worked out and compared,
  // whichever matches, so the time taken says nothing of how near a guess was.
  stepOf(secret: Buffer, code: string, steps: readonly number[]): number | undefined {
    const given = Buffer.from(code);
    let found: number | undefined;
    for (const step of steps) {
      const expected = Buffer.from(this.codeAt(secret, step));
      const same = given.length === expected.length && timingSafeEqual(given, expected);
      if (same && found === undefined) found = step;
    }
    return found;
  }

  // The secret as a person types it into an app: RFC 4648's base32, without padding.
  base32(secret: Buffer): string {
    let bits = '';
    for (const byte of secret) bits += byte.toString(2).padStart(8, '0');
    let text = '';
    for (let at = 0; at < bits.length; at += 5) {
      text += base32Alphabet.charAt(Number.parseInt(bits.slice(at, at + 5).padEnd(5, '0'), 2));
    }
    return text;
  }

  // What a QR code holds for an app to scan (the "Key URI format" the apps share): the secret,
  // whose login it is for, and the code's shape said outright.
  uri(secret: Buffer, account: string): string {
    const issuer = 'Open ADMS';
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const said = [
      `secret=${this.base32(secret)}`,
      `issuer=${encodeURIComponent(issuer)}`,
      'algorithm=SHA1',
      `digits=${String(twoStepCode.digits)}`,
      `period=${String(twoStepCode.stepSeconds)}`,
    ];
    return `otpauth://totp/${label}?${said.join('&')}`;
  }
}
