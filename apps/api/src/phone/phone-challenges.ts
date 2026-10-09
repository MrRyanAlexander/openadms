// The challenge the server makes a phone before it proves itself (ARCHITECTURE §7.4, §9 (1);
// AC-05-03; AC-10-45, 46; T-02, T-11; ADR-437): NIST SP 800-63B-4 §3.1.6.2 (a nonce of at least
// 64 bits, unique), §3.2.12 (an approved random bit generator); OWASP ASVS 5.0 6.7.2, 11.5.1.
//
// The server keeps nothing of a challenge it has made: a row written each time anybody asks for
// one would let the open web grow the database (ADR-401). A challenge names the phone it is
// for and the moment it was made, carries 256 random bits, and is signed with the API's own
// secret over all three. So nobody else can make or change one, it runs out by itself, and a
// challenge made for one phone is no use to another. That it is good once is kept on the
// phone's own record, written when the phone has proved itself (the rule: the domain's
// `PhoneProofRules.unspent`).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { PhoneProofRules } from '@open-adms/domain';

export interface Challenged {
  readonly deviceId: string;
  readonly madeAt: Date;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class PhoneChallenges {
  private readonly key: Buffer;
  private readonly rules: PhoneProofRules;
  private readonly random: (bytes: number) => Buffer;

  // The signing secret is the API's (ADMS_TOKEN_SIGNING_SECRET); a key of this purpose alone is
  // drawn from it, so nothing signed for another purpose is ever a challenge.
  constructor(
    signingSecret: string,
    rules: PhoneProofRules,
    random: (bytes: number) => Buffer = randomBytes,
  ) {
    this.key = createHmac('sha256', signingSecret).update('open-adms/phone-challenge/v1').digest();
    this.rules = rules;
    this.random = random;
  }

  // A challenge for the phone, made now.
  make(deviceId: string, now: Date): string {
    const nonce = this.random(PhoneProofRules.nonceBytes).toString('base64url');
    const named = Buffer.from(`${deviceId}.${String(now.getTime())}.${nonce}`).toString(
      'base64url',
    );
    return `${named}.${this.signature(named).toString('base64url')}`;
  }

  // Which phone a challenge is for and when it was made; undefined when the server didn't make
  // it, or it has run out.
  read(challenge: string, now: Date): Challenged | undefined {
    const [named, signature, ...more] = challenge.split('.');
    if (named === undefined || signature === undefined || more.length > 0) return undefined;
    const given = Buffer.from(signature, 'base64url');
    const expected = this.signature(named);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    const [deviceId, made, nonce, ...rest] = Buffer.from(named, 'base64url')
      .toString('utf8')
      .split('.');
    if (deviceId === undefined || made === undefined || nonce === undefined || rest.length > 0) {
      return undefined;
    }
    if (!uuid.test(deviceId) || !/^\d{13,15}$/.test(made)) return undefined;
    const madeAt = new Date(Number(made));
    return this.rules.live(madeAt, now) ? { deviceId, madeAt } : undefined;
  }

  private signature(named: string): Buffer {
    return createHmac('sha256', this.key).update(named).digest();
  }
}
