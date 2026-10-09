// What a phone holds after it has proved itself (ARCHITECTURE §6, Device sessions; §7.4, §9 (1);
// AC-05-03; AC-10-45, 46; ADR-437 (6), 440): NIST SP 800-63B-4 §5.1 (a session secret made by
// the server in direct response to an authentication, with at least 64 random bits, sent only
// over the protected channel, and timing out).
//
// A token names its phone and when it runs out, carries 128 random bits, and is signed with a
// key of this purpose alone drawn from ADMS_TOKEN_SIGNING_SECRET, so nothing signed for another
// purpose is ever a phone's token and nobody else can make or change one. The server keeps
// nothing of it. It only says which phone to look up: whether that phone's key still stands is
// read from the database on every request (phone-proofs.ts), so a revoked key refuses at once.
// A phone sends it as `Authorization: Bearer`, never as a cookie.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const randomPart = /^[A-Za-z0-9_-]{22}$/;

export class PhoneTokens {
  // The random part of a token, in bytes: twice the 64 bits the standard asks.
  static readonly randomBytes = 16;

  private readonly key: Buffer;
  private readonly minutes: number;

  constructor(signingSecret: string, minutes: number) {
    this.key = createHmac('sha256', signingSecret).update('open-adms/phone-token/v1').digest();
    this.minutes = minutes;
  }

  // How long a token is good for, in seconds.
  get seconds(): number {
    return this.minutes * 60;
  }

  // A token for the phone, made now.
  make(deviceId: string, now: Date): string {
    const expiresAt = String(now.getTime() + this.minutes * 60_000);
    const random = randomBytes(PhoneTokens.randomBytes).toString('base64url');
    return `${deviceId}.${expiresAt}.${random}.${this.signed(deviceId, expiresAt, random)}`;
  }

  // The phone a token names; undefined when the API didn't sign it or it has run out.
  deviceOf(token: string | undefined, now: Date): string | undefined {
    const [deviceId, expires, random, signature, ...more] = (token ?? '').split('.');
    if (
      deviceId === undefined ||
      expires === undefined ||
      random === undefined ||
      signature === undefined ||
      more.length > 0
    ) {
      return undefined;
    }
    if (!uuid.test(deviceId) || !/^\d{13,15}$/.test(expires) || !randomPart.test(random)) {
      return undefined;
    }
    const given = Buffer.from(signature);
    const expected = Buffer.from(this.signed(deviceId, expires, random));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    return Number(expires) > now.getTime() ? deviceId : undefined;
  }

  private signed(deviceId: string, expiresAt: string, random: string): string {
    return createHmac('sha256', this.key)
      .update(`${deviceId}\n${expiresAt}\n${random}`)
      .digest('base64url');
  }
}
