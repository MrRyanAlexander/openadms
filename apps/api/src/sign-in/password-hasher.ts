// A password's slow hash (ARCHITECTURE §6, Passwords; AC-10-20; T-16, T-43; ADR-402, 411): Argon2id
// at OWASP's setting of 19 MiB, 2 passes and 1 lane, a salt of 16 random bytes for each password
// and a tag of 32, written as the PHC string any Argon2 library reads and the only thing
// `user_credential.passwordHash` takes. Node's own Argon2 (node:crypto), as the installer hashes
// the master passcode (ADR-281). The string carries its own settings, so a hash made under
// earlier ones still checks after they are raised.
//
// The hash is keyed (NIST SP 800-63B-4 §3.1.1.2: a keyed hash with a secret kept apart from the
// hashed passwords): Argon2's own secret input, a key of this purpose alone drawn from the API's
// signing secret, which is in the API's settings and never in the database. Whoever copies the
// database alone can't try a single guess against a hash. The string names the key (`keyid`),
// never holds it; one with no key named was made before, still checks, and is made again at its
// owner's next sign-in.
import { argon2, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { passwordAsKept } from '@open-adms/domain';

interface Cost {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

export class PasswordHasher {
  // In kibibytes, passes and lanes.
  static readonly cost: Cost = { memory: 19456, passes: 2, parallelism: 1 };
  // The name of the key in a hash's string: "v1" in the PHC format's base64.
  static readonly keyId = 'djE';
  private static readonly saltBytes = 16;
  private static readonly tagBytes = 32;
  private static readonly format =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)(?:,keyid=([A-Za-z0-9+/]+))?\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

  private readonly key: Buffer;

  // The signing secret is the API's (ADMS_TOKEN_SIGNING_SECRET).
  constructor(signingSecret: string) {
    this.key = createHmac('sha256', signingSecret).update('open-adms/password-key/v1').digest();
  }

  // The whole password, in Unicode's composed form: never trimmed, folded or cut short.
  async hash(password: string): Promise<string> {
    const salt = randomBytes(PasswordHasher.saltBytes);
    const tag = await this.derive(
      password,
      salt,
      PasswordHasher.cost,
      PasswordHasher.tagBytes,
      this.key,
    );
    const { memory, passes, parallelism } = PasswordHasher.cost;
    const settings = `m=${String(memory)},t=${String(passes)},p=${String(parallelism)},keyid=${PasswordHasher.keyId}`;
    return `$argon2id$v=19$${settings}$${this.encode(salt)}$${this.encode(tag)}`;
  }

  // The master passcode's hash, with no key, as the installer makes the firm's first one
  // (`tools/setup`, which reads it back by that format; whether it is keyed is task 2.5.1's,
  // with what a phone's own check is made from).
  async hashWithoutKey(passcode: string): Promise<string> {
    const salt = randomBytes(PasswordHasher.saltBytes);
    const tag = await this.derive(
      passcode,
      salt,
      PasswordHasher.cost,
      PasswordHasher.tagBytes,
      undefined,
    );
    const { memory, passes, parallelism } = PasswordHasher.cost;
    const settings = `m=${String(memory)},t=${String(passes)},p=${String(parallelism)}`;
    return `$argon2id$v=19$${settings}$${this.encode(salt)}$${this.encode(tag)}`;
  }

  async verify(password: string, phc: string): Promise<boolean> {
    const parts = PasswordHasher.format.exec(phc);
    if (parts === null) return false;
    const [, memory, passes, parallelism, keyId, salt, tag] = parts;
    // A key this process doesn't hold: nothing checks against it.
    if (keyId !== undefined && keyId !== PasswordHasher.keyId) return false;
    const expected = Buffer.from(tag ?? '', 'base64');
    const actual = await this.derive(
      password,
      Buffer.from(salt ?? '', 'base64'),
      { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
      expected.length,
      keyId === undefined ? undefined : this.key,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  // Whether a hash that checked should be made again: it has no key, or was made under settings
  // since raised.
  stale(phc: string): boolean {
    const parts = PasswordHasher.format.exec(phc);
    if (parts === null) return true;
    const [, memory, passes, parallelism, keyId] = parts;
    const { cost } = PasswordHasher;
    return (
      keyId !== PasswordHasher.keyId ||
      Number(memory) < cost.memory ||
      Number(passes) < cost.passes ||
      Number(parallelism) < cost.parallelism
    );
  }

  private derive(
    password: string,
    salt: Buffer,
    cost: Cost,
    tagLength: number,
    secret: Buffer | undefined,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message: passwordAsKept(password),
          nonce: salt,
          memory: cost.memory,
          passes: cost.passes,
          parallelism: cost.parallelism,
          tagLength,
          ...(secret === undefined ? {} : { secret }),
        },
        (error, tag) => {
          if (error === null) resolve(tag);
          else reject(error);
        },
      );
    });
  }

  // PHC strings use unpadded standard base64.
  private encode(bytes: Buffer): string {
    return bytes.toString('base64').replace(/=+$/, '');
  }
}
