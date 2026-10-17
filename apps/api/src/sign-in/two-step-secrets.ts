// How an authenticator's secret is kept, and carried while it is being set up (ARCHITECTURE §6;
// AC-10-11, 26; T-26, T-43; ADR-397, 412). The server must read the secret to check a code, so
// it can't be a hash as a password is. NIST SP 800-63B-4 §3.1.4.2: the verifier's copy "SHALL be
// strongly protected against unauthorized disclosure".
//
// - **At rest** it is sealed with AES-256-GCM under a key of this purpose alone, drawn from the
//   API's own sealing key (`ADMS_SEALING_KEY`, ADR-542; the Phase 2 audit's F11), which is in the
//   API's settings and never in the database, and seals nothing but what is kept at rest.
//   Whoever copies the database or a backup alone holds no secret an authenticator could be made
//   from. The sealing is bound to the person it is for: one row's value put on another's opens
//   nothing. The string says its version: `v2`, the sealing key's; `v1`, a key drawn from the
//   signing secret before the keys were parted, is opened where this process holds that secret,
//   and sealed again at its owner's next sign-in (`stale`).
// - **While it is being set up** nothing is in the database at all. The server hands the person
//   the secret and, beside it, the same secret sealed with whose it is and when it runs out (a
//   key of that purpose alone); the person sends that back with their first code. Only a code
//   that proves the app has the secret gets it kept.
//
// Losing or changing the sealing key means every authenticator is set up again (ADR-411, 542);
// losing the signing secret now only ends sessions and codes in flight.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const version = 'v2';
const earlierVersion = 'v1';
const part = /^[A-Za-z0-9_-]+$/;

export class TwoStepSecrets {
  private readonly keptKey: Buffer;
  private readonly earlierKeptKey: Buffer | undefined;
  private readonly setupKey: Buffer;

  // The sealing key is the API's (ADMS_SEALING_KEY). The signing secret, where given, is only to
  // open a secret sealed under the key drawn from it before ADR-542.
  constructor(sealingKey: string, earlierSigningSecret?: string) {
    const keyFor = (secret: string, purpose: string): Buffer =>
      createHmac('sha256', secret).update(purpose).digest();
    this.keptKey = keyFor(sealingKey, 'open-adms/two-step-secret/v2');
    this.setupKey = keyFor(sealingKey, 'open-adms/two-step-setup/v2');
    this.earlierKeptKey =
      earlierSigningSecret === undefined
        ? undefined
        : keyFor(earlierSigningSecret, 'open-adms/two-step-secret/v1');
  }

  // What `user_credential.twoStepSecret` holds for this person.
  seal(userId: string, secret: Buffer): string {
    return `${version}.${this.sealed(this.keptKey, `kept\n${userId}`, secret)}`;
  }

  // The secret a person's row holds; undefined when this process can't open it.
  open(userId: string, kept: string): Buffer | undefined {
    const [said, ...parts] = kept.split('.');
    const key =
      said === version ? this.keptKey : said === earlierVersion ? this.earlierKeptKey : undefined;
    if (key === undefined) return undefined;
    return this.opened(key, `kept\n${userId}`, parts);
  }

  // What a row should hold instead, where it is sealed under an earlier key this process can
  // open: the same secret, sealed under the sealing key. Undefined where it is current already,
  // or can't be opened.
  resealed(userId: string, kept: string): string | undefined {
    if (kept.startsWith(`${version}.`)) return undefined;
    const secret = this.open(userId, kept);
    return secret === undefined ? undefined : this.seal(userId, secret);
  }

  // What a person sends back with their first code: the secret, whose it is, and its end.
  setup(userId: string, secret: Buffer, expiresAt: Date): string {
    const until = Buffer.alloc(8);
    until.writeBigUInt64BE(BigInt(expiresAt.getTime()));
    return this.sealed(this.setupKey, `setup\n${userId}`, Buffer.concat([until, secret]));
  }

  // The secret a setup carries, when the server began it for this person and it hasn't run out.
  readSetup(userId: string, setup: string, now: Date): Buffer | undefined {
    const opened = this.opened(this.setupKey, `setup\n${userId}`, setup.split('.'));
    if (opened === undefined || opened.length <= 8) return undefined;
    if (opened.readBigUInt64BE(0) <= BigInt(now.getTime())) return undefined;
    return opened.subarray(8);
  }

  private sealed(key: Buffer, boundTo: string, plain: Buffer): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(boundTo));
    const hidden = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [nonce, hidden, cipher.getAuthTag()]
      .map((bytes) => bytes.toString('base64url'))
      .join('.');
  }

  private opened(key: Buffer, boundTo: string, parts: readonly string[]): Buffer | undefined {
    const [nonce, hidden, tag, ...more] = parts;
    if (nonce === undefined || hidden === undefined || tag === undefined || more.length > 0) {
      return undefined;
    }
    if (![nonce, hidden, tag].every((text) => part.test(text))) return undefined;
    const nonceBytes = Buffer.from(nonce, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    if (nonceBytes.length !== 12 || tagBytes.length !== 16) return undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonceBytes);
      decipher.setAAD(Buffer.from(boundTo));
      decipher.setAuthTag(tagBytes);
      return Buffer.concat([decipher.update(Buffer.from(hidden, 'base64url')), decipher.final()]);
    } catch {
      // Not sealed by this key, not for this person, or altered.
      return undefined;
    }
  }
}
