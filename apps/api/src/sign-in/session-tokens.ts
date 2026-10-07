// What a back-office or outside user's browser holds of a session (ARCHITECTURE §6, Back-office
// sessions; AC-10-09, 12…16; T-14, T-15; ADR-398, 408). Three values, none kept by the server as
// it is:
// - **The access token**: the session's id and when the token runs out, signed by the API. Good
//   for the policy's few minutes. It only says which session to look up: who the person is and
//   what they may do is read from the database on every request.
// - **The refresh token**: the session's id and 32 random bytes. The server keeps the SHA-256 of
//   those bytes, the one in force, on the session's row; a token whose bytes aren't that one has
//   been used before.
// - **The CSRF value**: a signature over the session's id. A page sends it with every call that
//   isn't a GET. Another site's page can make a browser send the cookies, but can't read an
//   answer of the API's, so it never has this value. It opens nothing by itself.
// Each is signed with a key of its purpose alone, drawn from ADMS_TOKEN_SIGNING_SECRET, so
// nothing signed for one purpose is ever taken for another.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const randomPart = /^[A-Za-z0-9_-]{43}$/;

export interface RefreshRead {
  readonly sessionId: string;
  // What the session's row holds if this token is the one in force.
  readonly hash: string;
}

export class SessionTokens {
  private readonly accessKey: Buffer;
  private readonly csrfKey: Buffer;
  private readonly accessMinutes: number;

  constructor(signingSecret: string, accessMinutes: number) {
    const keyFor = (purpose: string): Buffer =>
      createHmac('sha256', signingSecret).update(purpose).digest();
    this.accessKey = keyFor('open-adms/access-token/v1');
    this.csrfKey = keyFor('open-adms/csrf/v1');
    this.accessMinutes = accessMinutes;
  }

  // How long an access token is good for, in seconds: its cookie's age.
  get accessSeconds(): number {
    return this.accessMinutes * 60;
  }

  access(sessionId: string, now: Date): string {
    const expiresAt = now.getTime() + this.accessMinutes * 60_000;
    return `${sessionId}.${String(expiresAt)}.${this.signed(this.accessKey, `${sessionId}\n${String(expiresAt)}`)}`;
  }

  // The session an access token names; undefined when the API didn't sign it or it has run out.
  sessionOfAccess(token: string | undefined, now: Date): string | undefined {
    const [sessionId, expires, signature, ...more] = (token ?? '').split('.');
    if (sessionId === undefined || expires === undefined || signature === undefined) {
      return undefined;
    }
    if (more.length > 0 || !uuid.test(sessionId) || !/^\d{13,15}$/.test(expires)) return undefined;
    if (!this.same(signature, this.signed(this.accessKey, `${sessionId}\n${expires}`))) {
      return undefined;
    }
    return Number(expires) > now.getTime() ? sessionId : undefined;
  }

  // The random half of a new refresh token, and what the server keeps of it.
  newRefresh(): { readonly secret: string; readonly hash: string } {
    const secret = randomBytes(32).toString('base64url');
    return { secret, hash: SessionTokens.hashOf(secret) };
  }

  refresh(sessionId: string, secret: string): string {
    return `${sessionId}.${secret}`;
  }

  // What a refresh token says it is; undefined when it isn't shaped like one. Whether it is the
  // one in force is asked of the session's row.
  readRefresh(token: string | undefined): RefreshRead | undefined {
    const [sessionId, secret, ...more] = (token ?? '').split('.');
    if (sessionId === undefined || secret === undefined || more.length > 0) return undefined;
    if (!uuid.test(sessionId) || !randomPart.test(secret)) return undefined;
    return { sessionId, hash: SessionTokens.hashOf(secret) };
  }

  csrf(sessionId: string): string {
    return this.signed(this.csrfKey, sessionId);
  }

  csrfMatches(sessionId: string, given: unknown): boolean {
    return typeof given === 'string' && this.same(given, this.csrf(sessionId));
  }

  // Whether two hashes of refresh tokens are the same, in the same time whatever they hold.
  sameHash(one: string, other: string): boolean {
    return this.same(one, other);
  }

  private static hashOf(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private signed(key: Buffer, what: string): string {
    return createHmac('sha256', key).update(what).digest('base64url');
  }

  private same(given: string, expected: string): boolean {
    const one = Buffer.from(given);
    const other = Buffer.from(expected);
    return one.length === other.length && timingSafeEqual(one, other);
  }
}
