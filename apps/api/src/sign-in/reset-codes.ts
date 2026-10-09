// The code a password reset by email carries (ARCHITECTURE §6; AC-10-25; ADR-404). The server
// keeps nothing of it: the code names the person and when it runs out, and is signed with the
// API's own secret over those and over the password hash the person has now. So it can't be
// made or changed by anybody else, it runs out by itself, and it is good once: the moment the
// password changes, by this code or any other way, the hash it was signed over is gone. It is
// long past guessing (a 256-bit signature), never six digits a caller could try in turn.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ResetNamed {
  readonly userId: string;
  readonly expiresAt: Date;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ResetCodes {
  private readonly key: Buffer;
  private readonly minutes: number;

  // The signing secret is the API's (ADMS_TOKEN_SIGNING_SECRET); a key of this purpose alone is
  // drawn from it, so nothing signed for another purpose is ever a reset code.
  constructor(signingSecret: string, minutes: number) {
    this.key = createHmac('sha256', signingSecret).update('open-adms/password-reset/v1').digest();
    this.minutes = minutes;
  }

  // A code for the person, over the password hash they have now (none yet: null).
  make(userId: string, passwordHash: string | null, now: Date): string {
    const expiresAt = now.getTime() + this.minutes * 60_000;
    const named = Buffer.from(`${userId}.${String(expiresAt)}`).toString('base64url');
    return `${named}.${this.signature(userId, expiresAt, passwordHash).toString('base64url')}`;
  }

  // Who a code names and until when; undefined when it isn't shaped like one or has run out.
  // Whether the server signed it is `signedOver`, asked once the person's hash has been read.
  read(code: string, now: Date): ResetNamed | undefined {
    const [named, signature, ...more] = code.split('.');
    if (named === undefined || signature === undefined || more.length > 0) return undefined;
    const [userId, expires, ...rest] = Buffer.from(named, 'base64url').toString('utf8').split('.');
    if (userId === undefined || expires === undefined || rest.length > 0) return undefined;
    if (!uuid.test(userId) || !/^\d{13,15}$/.test(expires)) return undefined;
    const expiresAt = Number(expires);
    if (expiresAt <= now.getTime()) return undefined;
    return { userId, expiresAt: new Date(expiresAt) };
  }

  // Whether the server signed this code for that person over this password hash.
  signedOver(code: string, named: ResetNamed, passwordHash: string | null): boolean {
    const given = Buffer.from(code.split('.')[1] ?? '', 'base64url');
    const expected = this.signature(named.userId, named.expiresAt.getTime(), passwordHash);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private signature(userId: string, expiresAt: number, passwordHash: string | null): Buffer {
    return createHmac('sha256', this.key)
      .update(`${userId}\n${String(expiresAt)}\n${passwordHash ?? ''}`)
      .digest();
  }
}
