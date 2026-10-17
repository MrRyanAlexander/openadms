// A password's slow hash (ARCHITECTURE §6, Passwords; AC-10-20; T-16, T-43; ADR-402, 411): Argon2id
// at OWASP's setting of 19 MiB, 2 passes and 1 lane, a salt of 16 random bytes for each password
// and a tag of 32, written as the PHC string any Argon2 library reads and the only thing
// `user_credential.passwordHash` takes. Node's own Argon2 (node:crypto), as the installer hashes
// the master passcode (ADR-281). The string carries its own settings, so a hash made under
// earlier ones still checks after they are raised.
//
// The hash is keyed (NIST SP 800-63B-4 §3.1.1.2: a keyed hash with a secret kept apart from the
// hashed passwords): Argon2's own secret input, a key of this purpose alone drawn from the API's
// own password key (`ADMS_PASSWORD_KEY`, ADR-542; the Phase 2 audit's F11), which is in the API's
// settings and never in the database, and is used for nothing else. Whoever copies the database
// alone can't try a single guess against a hash. The string names the key (`keyid`), never holds
// it: `v2` is the password key's. One with no key named, or named `v1` (a key drawn from the
// signing secret, ADR-411, before the keys were parted), was made before, still checks where this
// process holds that key, and is made again at its owner's next sign-in.
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
  // The name of the key in a hash's string: "v2" in the PHC format's base64; "v1", the key drawn
  // from the signing secret before ADR-542, is only ever read.
  static readonly keyId = 'djI';
  private static readonly earlierKeyId = 'djE';
  private static readonly saltBytes = 16;
  private static readonly tagBytes = 32;
  private static readonly format =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)(?:,keyid=([A-Za-z0-9+/]+))?\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

  private readonly key: Buffer;
  private readonly earlierKey: Buffer | undefined;

  // The password key is the API's (ADMS_PASSWORD_KEY). The signing secret (ADMS_TOKEN_SIGNING_SECRET),
  // where given, is only to check a hash made under the key drawn from it before ADR-542.
  constructor(passwordKey: string, earlierSigningSecret?: string) {
    this.key = createHmac('sha256', passwordKey).update('open-adms/password-key/v2').digest();
    this.earlierKey =
      earlierSigningSecret === undefined
        ? undefined
        : createHmac('sha256', earlierSigningSecret).update('open-adms/password-key/v1').digest();
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

  // A hash with no key, as the installer makes the firm's first master passcode (`tools/setup`,
  // which reads it back by that format): the API keys it at its first right use (ADR-542). Only a
  // test makes one here, to stand for the installer's.
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
    const secret =
      keyId === undefined
        ? undefined
        : keyId === PasswordHasher.keyId
          ? this.key
          : keyId === PasswordHasher.earlierKeyId
            ? this.earlierKey
            : null;
    if (secret === null || (keyId !== undefined && secret === undefined)) return false;
    const expected = Buffer.from(tag ?? '', 'base64');
    const actual = await this.derive(
      password,
      Buffer.from(salt ?? '', 'base64'),
      { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
      expected.length,
      secret,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  // Whether a hash is keyed with this process's password key: a master passcode's verifier is made
  // again only where it isn't (ADR-542), never for settings since raised.
  keyedNow(phc: string): boolean {
    return PasswordHasher.format.exec(phc)?.[4] === PasswordHasher.keyId;
  }

  // Whether a hash that checked should be made again: it has no key or an earlier one, or was
  // made under settings since raised.
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
